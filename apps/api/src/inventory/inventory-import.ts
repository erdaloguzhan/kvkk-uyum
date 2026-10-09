import { INVENTORY_COLUMNS, InventoryField, STORAGE_MEDIA, StorageMedium } from '@kvkk/shared';
import ExcelJS from 'exceljs';
import { createBody } from './inventory.schema';

/** İçe aktarılabilecek en fazla satır sayısı. */
export const MAX_IMPORT_ROWS = 2000;
/** Başlık satırı dosyanın ilk bu kadar satırında aranır. */
const HEADER_SEARCH_ROWS = 10;

export interface ImportedRow {
  /** Excel'deki satır numarası. */
  row: number;
  data: ReturnType<typeof createBody.parse>;
}

export interface ImportError {
  row: number | null;
  field?: InventoryField;
  column?: string;
  message: string;
}

export class ImportFileError extends Error {}

const normalize = (s: string) =>
  s
    .toLocaleLowerCase('tr')
    .replace(/\s+/g, ' ')
    .trim();

const LABELS = new Map(INVENTORY_COLUMNS.map((c) => [normalize(c.label), c]));
const MEDIA = new Map<string, StorageMedium>(
  [
    ...Object.entries(STORAGE_MEDIA).map(([k, v]) => [v, k] as const),
    ['Dijital ve Fiziksel', 'both'],
    ['Fiziksel/Dijital', 'both'],
    ['Fiziksel / Dijital', 'both'],
    ['Elektronik', 'digital'],
    ['Kağıt', 'physical'],
  ].map(([label, key]) => [normalize(label), key as StorageMedium]),
);

/**
 * Hücrenin metni. Birleştirilmiş hücrelerde (ör. aynı departmanın satırları alt alta birleştirilmişse)
 * birleşimin ilk hücresinin değeri kullanılır.
 */
function cellText(cell: ExcelJS.Cell): string {
  const source = cell.isMerged ? cell.master : cell;
  return (source.text ?? '').replace(/\r\n?/g, '\n').trim();
}

/**
 * Çok değerli sütunları ayırır. Amaç, hukuki sebep ve tedbirler satır satır yazılır (metinlerinde virgül geçer);
 * kişi grupları ve alıcılar TBL-010'da virgül veya nokta ile yan yana da yazılabiliyor.
 */
function splitList(field: InventoryField, text: string): string[] {
  const inline = field === 'dataSubjectGroups' || field === 'recipients';
  const parts = inline ? text.split(/\n|,|\.\s+|\.$/) : text.split('\n');
  return parts.map((p) => p.trim().replace(/,$/, '').trim()).filter(Boolean);
}

/**
 * TBL-010 biçimindeki Excel dosyasını okur. Sütunlar başlıklarına göre bulunur (sıraları farklı olabilir);
 * eksik sütunlar boş kabul edilir. Her satır ayrı doğrulanır, hatalar satır numarasıyla döner.
 */
export async function parseInventoryXlsx(file: Buffer): Promise<{ rows: ImportedRow[]; errors: ImportError[] }> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(file as unknown as ArrayBuffer);
  } catch {
    throw new ImportFileError('Dosya okunamadı; geçerli bir Excel (.xlsx) dosyası olmalı');
  }
  const sheet = workbook.worksheets.find((ws) => ws.actualRowCount > 0);
  if (!sheet) throw new ImportFileError('Dosyada dolu bir sayfa yok');

  // Başlık satırı: en çok TBL-010 sütun başlığı içeren satır (TBL-010'da 2. satır).
  let headerRow = 0;
  let columns = new Map<number, (typeof INVENTORY_COLUMNS)[number]>();
  for (let r = 1; r <= Math.min(HEADER_SEARCH_ROWS, sheet.rowCount); r++) {
    const found = new Map<number, (typeof INVENTORY_COLUMNS)[number]>();
    sheet.getRow(r).eachCell((cell, col) => {
      const def = LABELS.get(normalize(cellText(cell)));
      if (def && ![...found.values()].includes(def)) found.set(col, def);
    });
    if (found.size > columns.size) {
      columns = found;
      headerRow = r;
    }
  }
  const foundFields = new Set([...columns.values()].map((c) => c.field));
  const missingRequired = (['department', 'activity', 'dataCategory'] as const).filter((f) => !foundFields.has(f));
  if (missingRequired.length > 0) {
    const labels = missingRequired.map((f) => INVENTORY_COLUMNS.find((c) => c.field === f)!.label);
    throw new ImportFileError(`TBL-010 başlıkları bulunamadı (${labels.join(', ')})`);
  }

  const rows: ImportedRow[] = [];
  const errors: ImportError[] = [];
  let filledRows = 0;
  for (let r = headerRow + 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const raw: Record<string, unknown> = {};
    let hasValue = false;
    for (const [col, def] of columns) {
      const text = cellText(row.getCell(col));
      if (!text) continue;
      hasValue = true;
      if (def.kind === 'list') {
        raw[def.field] = splitList(def.field, text);
      } else if (def.kind === 'enum') {
        const medium = MEDIA.get(normalize(text));
        if (!medium) {
          errors.push({
            row: r,
            field: def.field,
            column: def.label,
            message: `"${text}" anlaşılamadı; ${Object.values(STORAGE_MEDIA).join(', ')} olmalı`,
          });
          continue;
        }
        raw[def.field] = medium;
      } else {
        raw[def.field] = text;
      }
    }
    if (!hasValue) continue;
    if (++filledRows > MAX_IMPORT_ROWS) {
      throw new ImportFileError(`Bir seferde en fazla ${MAX_IMPORT_ROWS} satır içe aktarılabilir`);
    }

    const parsed = createBody.safeParse(raw);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as InventoryField;
        const def = INVENTORY_COLUMNS.find((c) => c.field === field);
        const empty = raw[field] === undefined;
        errors.push({
          row: r,
          field,
          column: def?.label,
          message: empty ? 'Bu sütun boş bırakılamaz' : issue.message,
        });
      }
      continue;
    }
    if (!errors.some((e) => e.row === r)) rows.push({ row: r, data: parsed.data });
  }
  return { rows, errors };
}
