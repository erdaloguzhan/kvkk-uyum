import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  DATA_CATEGORIES,
  INVENTORY_COLUMNS,
  INVENTORY_REQUIRED_FIELDS,
  INVENTORY_TEMPLATE_FILE,
  INVENTORY_TEMPLATE_OPTIONS,
  InventoryField,
  STORAGE_MEDIA,
} from '@kvkk/shared';
import { and, asc, eq } from 'drizzle-orm';
import ExcelJS from 'exceljs';
import path from 'node:path';
import { AuditService } from '../audit/audit.service';
import { AppConfig, CONFIG } from '../config';
import { Database, InjectDb } from '../db/db.module';
import { inventoryEntries } from '../db/schema';

type EntryRow = typeof inventoryEntries.$inferSelect;
type EntryFields = Omit<EntryRow, 'id' | 'organizationId' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'>;
/** Yeni satırda departman, faaliyet ve veri kategorisi zorunludur; diğer alanlar sonradan doldurulabilir. */
export type NewEntryInput = Pick<EntryFields, 'department' | 'activity' | 'dataCategory'> & Partial<EntryFields>;
export type EntryInput = Partial<EntryFields>;

export interface ListFilter {
  department?: string;
  dataCategory?: string;
  incomplete?: boolean;
}

/** Öneri listesi üretilen alanlar (serbest metin ve çoklu seçim alanları). */
const SUGGESTION_FIELDS = INVENTORY_COLUMNS.filter((c) => c.kind !== 'enum').map((c) => c.field) as Exclude<
  InventoryField,
  'storageMedium'
>[];

/** TBL-010'da başlıklar ilk iki satırda; veriler 3. satırdan başlar. */
const FIRST_DATA_ROW = 3;

function isEmpty(value: unknown) {
  return value === null || value === undefined || (Array.isArray(value) ? value.length === 0 : value === '');
}

/** Satırın tamamlanması için doldurulması gereken alanlar (TBL-010 sütun sırasıyla). */
export function missingFields(entry: EntryRow): InventoryField[] {
  const noData = isEmpty(entry.personalData) && isEmpty(entry.specialCategoryData);
  return INVENTORY_COLUMNS.map((c) => c.field).filter((f) =>
    f === 'personalData' ? noData : INVENTORY_REQUIRED_FIELDS.includes(f) && isEmpty(entry[f]),
  );
}

const byTurkish = (a: string, b: string) => a.localeCompare(b, 'tr', { numeric: true });

const withStatus = (entry: EntryRow) => {
  const missing = missingFields(entry);
  return { ...entry, complete: missing.length === 0, missingFields: missing };
};

@Injectable()
export class InventoryService {
  constructor(
    @InjectDb() private readonly db: Database,
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly audit: AuditService,
  ) {}

  /** Sütun tanımları ve her alan için öneriler: TBL-010 örnekleri + kuruluşun daha önce girdiği değerler. */
  async options(orgId: string) {
    const rows = await this.db.select().from(inventoryEntries).where(eq(inventoryEntries.organizationId, orgId));
    const suggestions = Object.fromEntries(
      SUGGESTION_FIELDS.map((field) => {
        const template = INVENTORY_TEMPLATE_OPTIONS[field] ?? [];
        const own = new Set<string>();
        for (const row of rows) {
          const v = row[field];
          (Array.isArray(v) ? v : v ? [v] : []).forEach((x) => own.add(x));
        }
        // Hazır seçenekler verildiği sırayla, kuruluşun eklediği diğer değerler alfabetik olarak arkasından.
        const extra = [...own].filter((x) => !template.includes(x)).sort(byTurkish);
        return [field, [...template, ...extra]];
      }),
    );
    return {
      columns: INVENTORY_COLUMNS,
      requiredFields: INVENTORY_REQUIRED_FIELDS,
      storageMedia: STORAGE_MEDIA,
      // Veri kategorisi seçilirken örnekleri göstermek ve özel nitelikli olanları ayırt etmek için.
      dataCategories: DATA_CATEGORIES,
      suggestions,
    };
  }

  async list(orgId: string, filter: ListFilter = {}) {
    const conditions = [eq(inventoryEntries.organizationId, orgId)];
    if (filter.department) conditions.push(eq(inventoryEntries.department, filter.department));
    if (filter.dataCategory) conditions.push(eq(inventoryEntries.dataCategory, filter.dataCategory));
    const rows = await this.db
      .select()
      .from(inventoryEntries)
      .where(and(...conditions))
      .orderBy(asc(inventoryEntries.createdAt));
    // Veritabanı sıralaması Türkçe harfleri (İ, Ş, Ö...) doğru sıralamadığı için sıralama burada yapılır.
    rows.sort((a, b) => byTurkish(a.department, b.department) || byTurkish(a.activity, b.activity));
    const items = rows.map(withStatus);
    return filter.incomplete === undefined ? items : items.filter((e) => e.complete !== filter.incomplete);
  }

  /** Departman bazında satır sayıları ve eksik satırlar. */
  async summary(orgId: string) {
    const items = await this.list(orgId);
    const departments = new Map<string, { department: string; entries: number; incomplete: number }>();
    for (const e of items) {
      const d = departments.get(e.department) ?? { department: e.department, entries: 0, incomplete: 0 };
      d.entries++;
      if (!e.complete) d.incomplete++;
      departments.set(e.department, d);
    }
    return {
      entries: items.length,
      incomplete: items.filter((e) => !e.complete).length,
      specialCategory: items.filter((e) => !isEmpty(e.specialCategoryData)).length,
      foreignTransfer: items.filter((e) => !isEmpty(e.foreignTransfers)).length,
      departments: [...departments.values()],
    };
  }

  async get(orgId: string, id: string) {
    return withStatus(await this.find(orgId, id));
  }

  async create(orgId: string, userId: string, input: NewEntryInput) {
    const [entry] = await this.db
      .insert(inventoryEntries)
      .values({ ...input, organizationId: orgId, createdBy: userId, updatedBy: userId })
      .returning();
    await this.audit.record({
      action: 'inventory.created',
      organizationId: orgId,
      userId,
      entityType: 'inventory_entry',
      entityId: entry.id,
      metadata: { department: entry.department, activity: entry.activity, dataCategory: entry.dataCategory },
    });
    return withStatus(entry);
  }

  async update(orgId: string, userId: string, id: string, input: EntryInput) {
    const before = await this.find(orgId, id);
    const changed = (Object.keys(input) as (keyof EntryInput)[]).filter(
      (k) => JSON.stringify(before[k]) !== JSON.stringify(input[k]),
    );
    if (changed.length === 0) return withStatus(before);
    const [entry] = await this.db
      .update(inventoryEntries)
      .set({ ...input, updatedBy: userId, updatedAt: new Date() })
      .where(and(eq(inventoryEntries.id, id), eq(inventoryEntries.organizationId, orgId)))
      .returning();
    // Değerler değil yalnızca alan adları loglanır; geçmiş değerler gerekirse ayrı bir sürüm tablosuna alınır.
    await this.audit.record({
      action: 'inventory.updated',
      organizationId: orgId,
      userId,
      entityType: 'inventory_entry',
      entityId: id,
      metadata: { fields: changed },
    });
    return withStatus(entry);
  }

  /** Benzer bir faaliyet için satırı kopyalar (VERBİS'teki gibi ortak tedbirleri tekrar girmemek için). */
  async duplicate(orgId: string, userId: string, id: string) {
    const { id: _id, organizationId: _org, createdAt: _c, updatedAt: _u, createdBy: _cb, updatedBy: _ub, ...copy } =
      await this.find(orgId, id);
    const created = await this.create(orgId, userId, copy);
    await this.audit.record({
      action: 'inventory.duplicated',
      organizationId: orgId,
      userId,
      entityType: 'inventory_entry',
      entityId: created.id,
      metadata: { sourceId: id },
    });
    return created;
  }

  async remove(orgId: string, userId: string, id: string) {
    const entry = await this.find(orgId, id);
    await this.db.delete(inventoryEntries).where(eq(inventoryEntries.id, entry.id));
    await this.audit.record({
      action: 'inventory.deleted',
      organizationId: orgId,
      userId,
      entityType: 'inventory_entry',
      entityId: id,
      metadata: { department: entry.department, activity: entry.activity, dataCategory: entry.dataCategory },
    });
  }

  /** Envanteri TBL-010 şablonunun üzerine yazarak Excel dosyası üretir (başlıklar ve biçim şablondaki gibi kalır). */
  async exportXlsx(orgId: string, userId: string): Promise<Buffer> {
    const entries = await this.list(orgId);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(path.join(this.config.contentDir, INVENTORY_TEMPLATE_FILE));
    const sheet = workbook.worksheets[0];

    // Şablondaki örnek satırların biçimi yeni satırlara uygulanır, içerikleri silinir.
    const styleRow = sheet.getRow(FIRST_DATA_ROW);
    const styles = INVENTORY_COLUMNS.map((_, i) => ({ ...styleRow.getCell(i + 1).style }));
    const lastRow = Math.max(sheet.actualRowCount, FIRST_DATA_ROW + entries.length);
    for (let r = FIRST_DATA_ROW; r <= lastRow; r++) {
      const row = sheet.getRow(r);
      INVENTORY_COLUMNS.forEach((_, i) => (row.getCell(i + 1).value = null));
      row.height = undefined as unknown as number;
    }

    entries.forEach((entry, idx) => {
      const row = sheet.getRow(FIRST_DATA_ROW + idx);
      INVENTORY_COLUMNS.forEach((col, i) => {
        const cell = row.getCell(i + 1);
        cell.value = this.cellText(entry, col.field);
        cell.style = { ...styles[i], alignment: { ...styles[i].alignment, wrapText: true, vertical: 'top' } };
      });
      row.height = this.rowHeight(sheet, row);
      row.commit();
    });

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    await this.audit.record({
      action: 'inventory.exported',
      organizationId: orgId,
      userId,
      metadata: { entries: entries.length },
    });
    return buffer;
  }

  /**
   * Excel kaydırılmış metinde satır yüksekliğini açılışta kendisi ayarlamadığı için
   * yükseklik sütun genişliğine göre yaklaşık hesaplanır (Arial 10: satır başına ~13 pt).
   */
  private rowHeight(sheet: ExcelJS.Worksheet, row: ExcelJS.Row) {
    let lines = 1;
    INVENTORY_COLUMNS.forEach((_, i) => {
      const text = row.getCell(i + 1).value;
      if (typeof text !== 'string') return;
      const charsPerLine = Math.max(5, Math.floor((sheet.getColumn(i + 1).width ?? 10) * 1.1));
      const cellLines = text.split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length / charsPerLine)), 0);
      lines = Math.max(lines, cellLines);
    });
    return Math.min(409, lines * 13 + 4);
  }

  private cellText(entry: EntryRow, field: InventoryField): string | null {
    if (field === 'storageMedium') return entry.storageMedium ? STORAGE_MEDIA[entry.storageMedium] : null;
    const value = entry[field];
    if (!Array.isArray(value)) return value || null;
    if (value.length === 0) return null;
    // TBL-010'da amaç, hukuki sebep ve tedbirler alt alta; kişi grupları ve alıcılar yan yana yazılır.
    return field === 'dataSubjectGroups' || field === 'recipients' ? value.join(', ') : value.join('\n');
  }

  private async find(orgId: string, id: string) {
    const [entry] = await this.db
      .select()
      .from(inventoryEntries)
      .where(and(eq(inventoryEntries.id, id), eq(inventoryEntries.organizationId, orgId)));
    if (!entry) throw new NotFoundException('Envanter kaydı bulunamadı');
    return entry;
  }
}
