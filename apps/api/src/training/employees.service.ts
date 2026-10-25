import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { and, count, eq, inArray, ne } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';
import { blindIndex } from '../common/field-crypto';
import { Database, InjectDb } from '../db/db.module';
import { employees, organizations, trainingParticipants } from '../db/schema';
import { EmployeeImportFileError, parseEmployeesXlsx } from './employees-import';
import { EmployeeInput } from './training.schema';

const PHONE_TAKEN = 'Bu cep telefonu başka bir kişinin çalışan kaydında var; portal kullanıcı adı olduğu için kişiye özel olmalı';
const byTurkish = (a: string, b: string) => a.localeCompare(b, 'tr');
const fullName = (e: { firstName: string; lastName: string }) => `${e.firstName} ${e.lastName}`;

function checkDates(input: Partial<EmployeeInput>) {
  if (input.hireDate && input.terminationDate && input.terminationDate < input.hireDate) {
    throw new BadRequestException('İşten çıkış tarihi işe giriş tarihinden önce olamaz');
  }
}

/** Kuruluş (müşteri) çalışanları. Yönetim panelinde kuruluş sayfasından yönetilir. */
@Injectable()
export class EmployeesService {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  async list(orgId: string) {
    await this.ensureOrg(orgId);
    const rows = await this.db
      .select({ employee: employees, trainingCount: count(trainingParticipants.id) })
      .from(employees)
      .leftJoin(trainingParticipants, eq(trainingParticipants.employeeId, employees.id))
      .where(eq(employees.organizationId, orgId))
      .groupBy(employees.id);
    return rows
      .map((r) => ({ ...r.employee, trainingCount: r.trainingCount }))
      .sort((a, b) => byTurkish(fullName(a), fullName(b)));
  }

  async create(adminId: string, orgId: string, input: EmployeeInput) {
    await this.ensureOrg(orgId);
    checkDates(input);
    await this.ensureNationalIdFree(orgId, input.nationalId);
    if (input.phone) await this.ensurePhoneFree(input.phone, blindIndex(input.nationalId));
    const [row] = await this.db
      .insert(employees)
      .values({ ...input, nationalIdHash: blindIndex(input.nationalId), organizationId: orgId })
      .returning();
    await this.audit.record({
      action: 'training.employee_created',
      organizationId: orgId,
      userId: adminId,
      entityType: 'employee',
      entityId: row.id,
    });
    return row;
  }

  async update(adminId: string, orgId: string, id: string, input: Partial<EmployeeInput>) {
    const current = await this.find(orgId, id);
    checkDates({ ...current, ...input });
    if (input.nationalId && input.nationalId !== current.nationalId) await this.ensureNationalIdFree(orgId, input.nationalId);
    const phone = input.phone === undefined ? current.phone : input.phone;
    if (phone) await this.ensurePhoneFree(phone, input.nationalId ? blindIndex(input.nationalId) : current.nationalIdHash);
    const [row] = await this.db
      .update(employees)
      .set({ ...input, ...(input.nationalId && { nationalIdHash: blindIndex(input.nationalId) }), updatedAt: new Date() })
      .where(eq(employees.id, id))
      .returning();
    await this.audit.record({
      action: 'training.employee_updated',
      organizationId: orgId,
      userId: adminId,
      entityType: 'employee',
      entityId: id,
      metadata: { fields: Object.keys(input) },
    });
    return row;
  }

  async remove(adminId: string, orgId: string, id: string) {
    await this.find(orgId, id);
    const [{ n }] = await this.db
      .select({ n: count() })
      .from(trainingParticipants)
      .where(eq(trainingParticipants.employeeId, id));
    if (n > 0) {
      throw new ConflictException('Eğitim kaydı olan çalışan silinemez; ayrıldıysa işten çıkış tarihini girin');
    }
    await this.db.delete(employees).where(eq(employees.id, id));
    await this.audit.record({
      action: 'training.employee_deleted',
      organizationId: orgId,
      userId: adminId,
      entityType: 'employee',
      entityId: id,
    });
  }

  /**
   * Excel'den içe aktarır. T.C. kimlik no kuruluşta kayıtlıysa çalışanın bilgileri güncellenir, değilse eklenir.
   * Dosyada hata varsa hiçbir kayıt değişmez ve hatalar satır numarasıyla döner. `dryRun` yalnızca denetler.
   */
  async import(adminId: string, orgId: string, file: Buffer, dryRun: boolean) {
    await this.ensureOrg(orgId);
    let parsed: Awaited<ReturnType<typeof parseEmployeesXlsx>>;
    try {
      parsed = await parseEmployeesXlsx(file);
    } catch (err) {
      if (err instanceof EmployeeImportFileError) throw new BadRequestException(err.message);
      throw err;
    }
    const { rows, errors } = parsed;
    for (const r of rows) {
      if (r.data.hireDate && r.data.terminationDate && r.data.terminationDate < r.data.hireDate) {
        errors.push({ row: r.row, column: 'İşten Çıkış Tarihi', message: 'İşe giriş tarihinden önce olamaz' });
      }
    }
    const phoneOwner = new Map<string, string>();
    for (const r of rows) {
      if (!r.data.phone) continue;
      const hash = blindIndex(r.data.nationalId);
      const owner = phoneOwner.get(r.data.phone) ?? (await this.phoneOwner(r.data.phone, hash));
      if (owner && owner !== hash) errors.push({ row: r.row, column: 'Cep Telefonu', message: PHONE_TAKEN });
      else phoneOwner.set(r.data.phone, hash);
    }
    if (errors.length) {
      throw new BadRequestException({ message: 'Dosyada hatalı satırlar var; hiçbir kayıt değiştirilmedi', errors });
    }
    if (rows.length === 0) throw new BadRequestException('Dosyada çalışan satırı yok');

    const hashed = rows.map((r) => ({ ...r.data, nationalIdHash: blindIndex(r.data.nationalId) }));
    const existing = await this.db
      .select({ id: employees.id, nationalIdHash: employees.nationalIdHash })
      .from(employees)
      .where(and(eq(employees.organizationId, orgId), inArray(employees.nationalIdHash, hashed.map((d) => d.nationalIdHash))));
    const existingBy = new Map(existing.map((e) => [e.nationalIdHash, e.id]));
    const created = hashed.filter((d) => !existingBy.has(d.nationalIdHash)).length;
    const updated = rows.length - created;
    if (dryRun) return { dryRun: true, created, updated };

    await this.db.transaction(async (tx) => {
      for (const data of hashed) {
        const id = existingBy.get(data.nationalIdHash);
        if (id) {
          await tx.update(employees).set({ ...data, updatedAt: new Date() }).where(eq(employees.id, id));
        } else {
          await tx.insert(employees).values({ ...data, organizationId: orgId });
        }
      }
    });
    await this.audit.record({
      action: 'training.employees_imported',
      organizationId: orgId,
      userId: adminId,
      metadata: { created, updated },
    });
    return { dryRun: false, created, updated };
  }

  private async find(orgId: string, id: string) {
    const [row] = await this.db
      .select()
      .from(employees)
      .where(and(eq(employees.id, id), eq(employees.organizationId, orgId)));
    if (!row) throw new NotFoundException('Çalışan bulunamadı');
    return row;
  }

  private async ensureOrg(orgId: string) {
    const [org] = await this.db.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, orgId));
    if (!org) throw new NotFoundException('Kuruluş bulunamadı');
  }

  /**
   * Cep telefonu Eğitim Portalı kullanıcı adıdır; yalnızca bir kişiye ait olabilir. Aynı kişi (T.C. kimlik no)
   * birden çok kuruluşta aynı telefonla kayıtlı olabilir.
   */
  private async ensurePhoneFree(phone: string, nationalIdHash: string) {
    if (await this.phoneOwner(phone, nationalIdHash)) throw new ConflictException(PHONE_TAKEN);
  }

  /** Telefon başka bir kişiye aitse o kişinin T.C. no özeti, değilse undefined. */
  private async phoneOwner(phone: string, nationalIdHash: string) {
    const [other] = await this.db
      .select({ hash: employees.nationalIdHash })
      .from(employees)
      .where(and(eq(employees.phone, phone), ne(employees.nationalIdHash, nationalIdHash)));
    return other?.hash;
  }

  private async ensureNationalIdFree(orgId: string, nationalId: string) {
    const [dup] = await this.db
      .select({ id: employees.id })
      .from(employees)
      .where(and(eq(employees.organizationId, orgId), eq(employees.nationalIdHash, blindIndex(nationalId))));
    if (dup) throw new ConflictException('Bu T.C. kimlik no ile kayıtlı bir çalışan var');
  }
}
