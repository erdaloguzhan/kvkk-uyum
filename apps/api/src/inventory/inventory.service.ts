import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  INVENTORY_COLUMNS,
  INVENTORY_REQUIRED_FIELDS,
  INVENTORY_TEMPLATE_FILE,
  InventoryField,
  STORAGE_MEDIA,
  hasForeignTransfer,
  inventoryNameKey,
  inventoryRowKey,
} from '@kvkk/shared';
import { and, asc, eq, ne, sql } from 'drizzle-orm';
import ExcelJS from 'exceljs';
import path from 'node:path';
import { AuditService } from '../audit/audit.service';
import { AppConfig, CONFIG } from '../config';
import { Database, InjectDb } from '../db/db.module';
import { inventoryEntries } from '../db/schema';
import { ImportFileError, ImportedRow, parseInventoryXlsx } from './inventory-import';
import { InventoryTemplateService } from './inventory-template.service';

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

type ProcessCategory = Pick<EntryRow, 'department' | 'activity' | 'dataCategory'>;
const rowLabel = (r: ProcessCategory) => `${r.department} / ${r.activity} / ${r.dataCategory}`;

/** Aynı departman + faaliyet + veri kategorisi için ikinci satır açılmak istendiğinde dönen hata. */
export class DuplicateEntryException extends ConflictException {
  constructor(existing: ProcessCategory & { id: string }) {
    super({
      message: `"${rowLabel(existing)}" satırı envanterde zaten var. Bir departmanın aynı faaliyetinde bir veri kategorisi yalnızca bir kez yer alır; yeni kişisel verileri mevcut satıra ekleyin.`,
      existingId: existing.id,
    });
  }
}

/** Veritabanındaki tekil indeksle aynı ad anahtarı (bkz. inventoryNameKey). */
const nameKey = (value: unknown) => sql`lower(translate(${value}, 'İIı', 'iii'))`;

const isUniqueViolation = (err: unknown) =>
  (err as { code?: string; cause?: { code?: string } })?.code === '23505' ||
  (err as { cause?: { code?: string } })?.cause?.code === '23505';

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
    private readonly template: InventoryTemplateService,
  ) {}

  /**
   * Sütun tanımları ve her alan için öneriler: Kişisel Veri Envanteri (şablon) seçenekleri + kuruluşun daha önce
   * girdiği diğer değerler.
   */
  async options(orgId: string) {
    const rows = await this.db.select().from(inventoryEntries).where(eq(inventoryEntries.organizationId, orgId));
    const { byField, dataCategories } = await this.template.forInventory();
    const suggestions = Object.fromEntries(
      SUGGESTION_FIELDS.map((field) => {
        const template = byField.get(field) ?? [];
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
      dataCategories,
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
      foreignTransfer: items.filter((e) => hasForeignTransfer(e.foreignTransfers)).length,
      departments: [...departments.values()],
    };
  }

  async get(orgId: string, id: string) {
    return withStatus(await this.find(orgId, id));
  }

  async create(orgId: string, userId: string, input: NewEntryInput) {
    const names = await this.checkProcessCategory(orgId, input);
    const entry = await this.unique(
      this.db
        .insert(inventoryEntries)
        .values({ ...input, ...names, organizationId: orgId, createdBy: userId, updatedBy: userId })
        .returning(),
      orgId,
      names,
    );
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
    const names = await this.checkProcessCategory(orgId, { ...before, ...input }, id);
    const entry = await this.unique(
      this.db
        .update(inventoryEntries)
        .set({ ...input, ...names, updatedBy: userId, updatedAt: new Date() })
        .where(and(eq(inventoryEntries.id, id), eq(inventoryEntries.organizationId, orgId)))
        .returning(),
      orgId,
      names,
    );
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

  /**
   * TBL-010 biçimindeki Excel'i içe aktarır. Hatalı satır varsa hiçbir satır kaydedilmez ve hatalar
   * satır numarasıyla döner. `dryRun` yalnızca kontrol eder; `replace` mevcut envanteri silip yerine yazar.
   */
  async importXlsx(
    orgId: string,
    userId: string,
    file: Buffer,
    options: { dryRun: boolean; mode: 'append' | 'replace' },
  ) {
    let parsed: Awaited<ReturnType<typeof parseInventoryXlsx>>;
    try {
      parsed = await parseInventoryXlsx(file);
    } catch (err) {
      if (err instanceof ImportFileError) throw new BadRequestException(err.message);
      throw err;
    }
    const { rows, errors } = parsed;
    if (rows.length === 0 && errors.length === 0) throw new BadRequestException('Dosyada envanter satırı yok');
    if (errors.length > 0) {
      throw new BadRequestException({ message: 'Dosyada hatalı satırlar var; hiçbir satır kaydedilmedi', errors });
    }
    const duplicates = await this.importDuplicates(orgId, rows, options.mode);
    if (duplicates.length > 0) {
      throw new BadRequestException({
        message: 'Dosyada aynı departman, faaliyet ve veri kategorisi birden çok kez geçiyor; hiçbir satır kaydedilmedi',
        errors: duplicates,
      });
    }
    const preview = rows.map((r) => ({ row: r.row, ...r.data }));
    if (options.dryRun) return { dryRun: true, mode: options.mode, count: rows.length, rows: preview };

    const removed = await this.db.transaction(async (tx) => {
      let deleted = 0;
      if (options.mode === 'replace') {
        deleted = (
          await tx.delete(inventoryEntries).where(eq(inventoryEntries.organizationId, orgId)).returning({ id: inventoryEntries.id })
        ).length;
      }
      await tx
        .insert(inventoryEntries)
        .values(rows.map((r) => ({ ...r.data, organizationId: orgId, createdBy: userId, updatedBy: userId })));
      return deleted;
    });
    await this.audit.record({
      action: 'inventory.imported',
      organizationId: orgId,
      userId,
      metadata: { mode: options.mode, imported: rows.length, removed },
    });
    return { dryRun: false, mode: options.mode, count: rows.length, removed };
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

  /**
   * Hiyerarşiyi korur (Erdal, 17.11.2026): aynı departman + faaliyet + veri kategorisinde başka satır varsa hata verir.
   * Departman, faaliyet ve kategori adı yalnızca büyük/küçük harfle farklı yazılmışsa envanterdeki mevcut yazılış kullanılır;
   * böylece "İnsan Kaynakları" ile "insan kaynakları" iki ayrı departman gibi görünmez.
   */
  private async checkProcessCategory(orgId: string, row: ProcessCategory, selfId?: string): Promise<ProcessCategory> {
    const rows = await this.db
      .select({
        id: inventoryEntries.id,
        department: inventoryEntries.department,
        activity: inventoryEntries.activity,
        dataCategory: inventoryEntries.dataCategory,
      })
      .from(inventoryEntries)
      .where(
        and(
          eq(inventoryEntries.organizationId, orgId),
          sql`${nameKey(inventoryEntries.department)} = ${nameKey(row.department)}`,
          ...(selfId ? [ne(inventoryEntries.id, selfId)] : []),
        ),
      )
      .orderBy(asc(inventoryEntries.createdAt));
    const key = inventoryNameKey;
    const department = rows[0]?.department ?? row.department;
    const sameActivity = rows.filter((r) => key(r.activity) === key(row.activity));
    const activity = sameActivity[0]?.activity ?? row.activity;
    const existing = sameActivity.find((r) => key(r.dataCategory) === key(row.dataCategory));
    if (existing) throw new DuplicateEntryException(existing);
    return { department, activity, dataCategory: row.dataCategory };
  }

  /** Eşzamanlı iki kayıtta tekil indeks ihlali de aynı anlaşılır hatayı verir. */
  private async unique(query: Promise<EntryRow[]>, orgId: string, names: ProcessCategory): Promise<EntryRow> {
    try {
      const [entry] = await query;
      return entry;
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      const [existing] = await this.db
        .select()
        .from(inventoryEntries)
        .where(
          and(
            eq(inventoryEntries.organizationId, orgId),
            sql`${nameKey(inventoryEntries.department)} = ${nameKey(names.department)}`,
            sql`${nameKey(inventoryEntries.activity)} = ${nameKey(names.activity)}`,
            sql`${nameKey(inventoryEntries.dataCategory)} = ${nameKey(names.dataCategory)}`,
          ),
        );
      if (existing) throw new DuplicateEntryException(existing);
      throw err;
    }
  }

  /** İçe aktarımda tekrar eden satırlar: dosyanın kendi içinde ve (ekleme modunda) envanterde zaten olanlar. */
  private async importDuplicates(orgId: string, rows: ImportedRow[], mode: 'append' | 'replace') {
    const errors: { row: number; message: string }[] = [];
    const seen = new Map<string, number>();
    if (mode === 'append') {
      const existing = await this.db
        .select({
          department: inventoryEntries.department,
          activity: inventoryEntries.activity,
          dataCategory: inventoryEntries.dataCategory,
        })
        .from(inventoryEntries)
        .where(eq(inventoryEntries.organizationId, orgId));
      for (const e of existing) seen.set(inventoryRowKey(e), 0);
    }
    for (const r of rows) {
      const k = inventoryRowKey(r.data);
      const first = seen.get(k);
      if (first === undefined) {
        seen.set(k, r.row);
        continue;
      }
      errors.push({
        row: r.row,
        message:
          first === 0
            ? `"${rowLabel(r.data)}" envanterde zaten var; satırı dosyadan çıkarın veya mevcut envanteri değiştirerek aktarın`
            : `"${rowLabel(r.data)}" ${first}. satırda da var; aynı kategorinin kişisel verilerini tek satırda yazın`,
      });
    }
    return errors;
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
