import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';
import { Database, InjectDb } from '../db/db.module';
import { contracts } from '../db/schema';
import { dateIn, daysBetween } from '../workflow/dates';

type ContractRow = typeof contracts.$inferSelect;
type ContractFields = Omit<ContractRow, 'id' | 'organizationId' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'>;
export type NewContractInput = Pick<ContractFields, 'partyName' | 'type'> & Partial<ContractFields>;
export type ContractInput = Partial<ContractFields>;

export interface ContractFilter {
  type?: ContractRow['type'];
  status?: ContractRow['status'];
  /** Karşı taraf, ilgili kişi veya e-postada arar. */
  q?: string;
}

const byTurkish = (a: string, b: string) => a.localeCompare(b, 'tr', { numeric: true });

/** Bitiş tarihine kalan gün (bitiş tarihi yoksa null). Statü kullanıcı tarafından değiştirilir; burada yalnızca uyarı için hesaplanır. */
const withDays = (c: ContractRow, today: string) => ({
  ...c,
  daysToEnd: c.endDate ? daysBetween(today, c.endDate) : null,
});

@Injectable()
export class ContractsService {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  async list(orgId: string, filter: ContractFilter = {}) {
    const conditions = [eq(contracts.organizationId, orgId)];
    if (filter.type) conditions.push(eq(contracts.type, filter.type));
    if (filter.status) conditions.push(eq(contracts.status, filter.status));
    let rows = await this.db.select().from(contracts).where(and(...conditions));
    if (filter.q) {
      const q = filter.q.toLocaleLowerCase('tr-TR');
      rows = rows.filter((c) =>
        [c.partyName, c.contactName, c.contactEmail].some((v) => v?.toLocaleLowerCase('tr-TR').includes(q)),
      );
    }
    // Veritabanı sıralaması Türkçe harfleri (İ, Ş, Ö...) doğru sıralamadığı için sıralama burada yapılır.
    rows.sort((a, b) => byTurkish(a.partyName, b.partyName));
    const today = dateIn(new Date());
    return rows.map((c) => withDays(c, today));
  }

  async get(orgId: string, id: string) {
    return withDays(await this.find(orgId, id), dateIn(new Date()));
  }

  async create(orgId: string, userId: string, input: NewContractInput) {
    this.checkDates(input.startDate, input.endDate);
    const [contract] = await this.db
      .insert(contracts)
      .values({ ...input, organizationId: orgId, createdBy: userId, updatedBy: userId })
      .returning();
    await this.audit.record({
      action: 'contract.created',
      organizationId: orgId,
      userId,
      entityType: 'contract',
      entityId: contract.id,
      metadata: { partyName: contract.partyName, type: contract.type, status: contract.status },
    });
    return withDays(contract, dateIn(new Date()));
  }

  async update(orgId: string, userId: string, id: string, input: ContractInput) {
    const before = await this.find(orgId, id);
    this.checkDates(
      input.startDate === undefined ? before.startDate : input.startDate,
      input.endDate === undefined ? before.endDate : input.endDate,
    );
    const changed = (Object.keys(input) as (keyof ContractInput)[]).filter((k) => before[k] !== input[k]);
    if (changed.length === 0) return withDays(before, dateIn(new Date()));
    const [contract] = await this.db
      .update(contracts)
      .set({ ...input, updatedBy: userId, updatedAt: new Date() })
      .where(and(eq(contracts.id, id), eq(contracts.organizationId, orgId)))
      .returning();
    // İletişim bilgileri kişisel veri olduğu için değerler değil yalnızca alan adları loglanır.
    await this.audit.record({
      action: 'contract.updated',
      organizationId: orgId,
      userId,
      entityType: 'contract',
      entityId: id,
      metadata: { fields: changed },
    });
    return withDays(contract, dateIn(new Date()));
  }

  async remove(orgId: string, userId: string, id: string) {
    const contract = await this.find(orgId, id);
    await this.db.delete(contracts).where(eq(contracts.id, contract.id));
    await this.audit.record({
      action: 'contract.deleted',
      organizationId: orgId,
      userId,
      entityType: 'contract',
      entityId: id,
      metadata: { partyName: contract.partyName, type: contract.type },
    });
  }

  private checkDates(start: string | null | undefined, end: string | null | undefined) {
    if (start && end && end < start) {
      throw new BadRequestException({
        message: 'Bitiş tarihi başlangıç tarihinden önce olamaz',
        errors: [{ path: 'endDate', message: 'Başlangıç tarihinden önce olamaz' }],
      });
    }
  }

  private async find(orgId: string, id: string) {
    const [contract] = await this.db
      .select()
      .from(contracts)
      .where(and(eq(contracts.id, id), eq(contracts.organizationId, orgId)));
    if (!contract) throw new NotFoundException('Sözleşme bulunamadı');
    return contract;
  }
}
