import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { and, count, eq, inArray, ne, sql } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';
import { Database, InjectDb } from '../db/db.module';
import { employees, organizations, trainingParticipants } from '../db/schema';
import { EmployeeImportFileError, parseEmployeesXlsx } from './employees-import';
import { EmployeeInput } from './training.schema';

const PHONE_TAKEN = 'Bu cep telefonu başka bir kişinin çalışan kaydında var; portal kullanıcı adı olduğu için kişiye özel olmalı';
const PHONE_IN_ORG = 'Bu cep telefonuyla bu kuruluşta kayıtlı bir çalışan var';
const byTurkish = (a: string, b: string) => a.localeCompare(b, 'tr');
const fullName = (e: { firstName: string; lastName: string }) => `${e.firstName} ${e.lastName}`;
/** Ad soyad karşılaştırması için: büyük/küçük harf ve boşluk farkı yok sayılır. */
const nameKey = (e: { firstName: string; lastName: string }) => fullName(e).toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim();

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
    if (input.phone) await this.ensurePhoneFree(orgId, input.phone, input);
    const [row] = await this.db
      .insert(employees)
      .values({ ...input, organizationId: orgId })
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
    const phone = input.phone === undefined ? current.phone : input.phone;
    if (phone) await this.ensurePhoneFree(orgId, phone, { ...current, ...input }, id);
    const [row] = await this.db
      .update(employees)
      .set({ ...input, updatedAt: new Date() })
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
   * Excel'den içe aktarır. Satır kuruluştaki bir çalışanla önce cep telefonundan, telefon yoksa ya da eşleşmezse
   * e-postadan eşleşirse o çalışanın bilgileri güncellenir, eşleşmezse yeni çalışan eklenir.
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

    const current = await this.db
      .select({ id: employees.id, phone: employees.phone, email: employees.email })
      .from(employees)
      .where(eq(employees.organizationId, orgId));
    const byPhone = new Map(current.filter((e) => e.phone).map((e) => [e.phone!, e.id]));
    const byEmail = new Map<string, string>();
    for (const e of current) if (e.email && !byEmail.has(e.email.toLowerCase())) byEmail.set(e.email.toLowerCase(), e.id);

    const targets: { data: EmployeeInput; id?: string }[] = [];
    const targetRow = new Map<string, number>();
    for (const r of rows) {
      const id = (r.data.phone && byPhone.get(r.data.phone)) || (r.data.email ? byEmail.get(r.data.email.toLowerCase()) : undefined);
      if (id) {
        const other = targetRow.get(id);
        if (other) {
          errors.push({ row: r.row, message: `${other}. satırla aynı çalışana denk geliyor (aynı cep telefonu veya e-posta)` });
          continue;
        }
        targetRow.set(id, r.row);
      }
      if (r.data.phone) {
        const owner = byPhone.get(r.data.phone);
        if (owner && owner !== id) {
          errors.push({ row: r.row, column: 'Cep Telefonu', message: PHONE_IN_ORG });
          continue;
        }
        if (await this.phoneOwnedElsewhere(orgId, r.data.phone, r.data)) {
          errors.push({ row: r.row, column: 'Cep Telefonu', message: PHONE_TAKEN });
          continue;
        }
      }
      targets.push({ data: r.data, id });
    }
    if (errors.length) {
      errors.sort((a, b) => a.row - b.row);
      throw new BadRequestException({ message: 'Dosyada hatalı satırlar var; hiçbir kayıt değiştirilmedi', errors });
    }
    if (rows.length === 0) throw new BadRequestException('Dosyada çalışan satırı yok');

    const created = targets.filter((t) => !t.id).length;
    const updated = targets.length - created;
    if (dryRun) return { dryRun: true, created, updated };

    await this.db.transaction(async (tx) => {
      // Telefonlar satırlar arasında yer değiştirebilir; tekillik ihlali olmasın diye önce güncellenecek kayıtların
      // telefonları boşaltılır.
      const ids = targets.flatMap((t) => (t.id ? [t.id] : []));
      if (ids.length) await tx.update(employees).set({ phone: null }).where(inArray(employees.id, ids));
      for (const { data, id } of targets) {
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
   * Cep telefonu Eğitim Portalı kullanıcı adıdır; yalnızca bir kişiye ait olabilir. Kuruluş içinde tek çalışanda
   * bulunur; başka kuruluşlarda aynı telefon ancak aynı ad soyadla (aynı kişi) kayıtlı olabilir.
   */
  private async ensurePhoneFree(orgId: string, phone: string, person: { firstName: string; lastName: string }, selfId?: string) {
    const [inOrg] = await this.db
      .select({ id: employees.id })
      .from(employees)
      .where(and(eq(employees.organizationId, orgId), eq(employees.phone, phone), selfId ? ne(employees.id, selfId) : sql`true`));
    if (inOrg) throw new ConflictException(PHONE_IN_ORG);
    if (await this.phoneOwnedElsewhere(orgId, phone, person)) throw new ConflictException(PHONE_TAKEN);
  }

  /** Telefon başka bir kuruluşta farklı ad soyadlı bir çalışanda kayıtlı mı. */
  private async phoneOwnedElsewhere(orgId: string, phone: string, person: { firstName: string; lastName: string }) {
    const others = await this.db
      .select({ firstName: employees.firstName, lastName: employees.lastName })
      .from(employees)
      .where(and(eq(employees.phone, phone), ne(employees.organizationId, orgId)));
    return others.some((o) => nameKey(o) !== nameKey(person));
  }
}
