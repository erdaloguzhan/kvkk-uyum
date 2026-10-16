import ExcelJS from 'exceljs';
import { EmployeeInput, employeeBody } from './training.schema';

export const MAX_EMPLOYEE_IMPORT_ROWS = 5000;

/** Çalışan Excel dosyasının sütunları (içe aktarma şablonu ve dışa aktarma aynı başlıkları kullanır). */
export const EMPLOYEE_COLUMNS: { field: keyof EmployeeInput; label: string; aliases?: string[] }[] = [
  { field: 'nationalId', label: 'T.C. Kimlik No', aliases: ['tc kimlik no', 'tc', 't.c.', 'tckn', 'kimlik no'] },
  { field: 'firstName', label: 'Adı', aliases: ['ad'] },
  { field: 'lastName', label: 'Soyadı', aliases: ['soyad'] },
  { field: 'hireDate', label: 'İşe Giriş Tarihi', aliases: ['işe giriş'] },
  { field: 'terminationDate', label: 'İşten Çıkış Tarihi', aliases: ['işten çıkış'] },
  { field: 'phone', label: 'Cep Telefonu', aliases: ['telefon', 'cep'] },
  { field: 'email', label: 'E-posta', aliases: ['e-posta adresi', 'eposta', 'email', 'e-mail'] },
];

export class EmployeeImportFileError extends Error {}

export interface EmployeeImportError {
  row: number;
  column?: string;
  message: string;
}

const normalize = (s: string) => s.toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim();
const HEADERS = new Map<string, (typeof EMPLOYEE_COLUMNS)[number]>();
for (const c of EMPLOYEE_COLUMNS) {
  for (const name of [c.label, ...(c.aliases ?? [])]) HEADERS.set(normalize(name), c);
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Tarih hücresi: Excel tarihi, 31.12.2024 / 31/12/2024 veya 2024-12-31 → YYYY-AA-GG. */
function dateValue(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v instanceof Date) return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
  const text = (cell.text ?? '').trim();
  const tr = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(text);
  if (tr) return `${tr[3]}-${pad(Number(tr[2]))}-${pad(Number(tr[1]))}`;
  return text;
}

function textValue(cell: ExcelJS.Cell): string {
  const v = cell.value;
  // Hücre sayı biçimindeyse T.C. no ve telefon bilimsel gösterime dönmesin.
  if (typeof v === 'number') return String(Math.trunc(v));
  if (v && typeof v === 'object' && 'hyperlink' in v && 'text' in v) {
    return String((v as { text: unknown }).text ?? '').replace(/^mailto:/i, '').trim();
  }
  return (cell.text ?? '').trim();
}

/** Çalışan listesini Excel'den okur. Sütunlar başlıklarına göre bulunur; her satır ayrı doğrulanır. */
export async function parseEmployeesXlsx(file: Buffer): Promise<{ rows: { row: number; data: EmployeeInput }[]; errors: EmployeeImportError[] }> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(file as unknown as ArrayBuffer);
  } catch {
    throw new EmployeeImportFileError('Dosya okunamadı; geçerli bir Excel (.xlsx) dosyası olmalı');
  }
  const sheet = workbook.worksheets.find((ws) => ws.actualRowCount > 0);
  if (!sheet) throw new EmployeeImportFileError('Dosyada dolu bir sayfa yok');

  let headerRow = 0;
  let columns = new Map<number, (typeof EMPLOYEE_COLUMNS)[number]>();
  for (let r = 1; r <= Math.min(10, sheet.rowCount); r++) {
    const found = new Map<number, (typeof EMPLOYEE_COLUMNS)[number]>();
    sheet.getRow(r).eachCell((cell, col) => {
      const def = HEADERS.get(normalize(cell.text ?? ''));
      if (def && ![...found.values()].includes(def)) found.set(col, def);
    });
    if (found.size > columns.size) {
      columns = found;
      headerRow = r;
    }
  }
  const fields = new Set([...columns.values()].map((c) => c.field));
  const missing = EMPLOYEE_COLUMNS.filter((c) => ['nationalId', 'firstName', 'lastName'].includes(c.field) && !fields.has(c.field));
  if (missing.length) {
    throw new EmployeeImportFileError(`Başlık satırında ${missing.map((c) => `"${c.label}"`).join(', ')} sütunları bulunamadı`);
  }

  const rows: { row: number; data: EmployeeInput }[] = [];
  const errors: EmployeeImportError[] = [];
  const seen = new Map<string, number>();
  for (let r = headerRow + 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const raw: Record<string, string> = {};
    let hasValue = false;
    for (const [col, def] of columns) {
      const cell = row.getCell(col);
      const value = def.field === 'hireDate' || def.field === 'terminationDate' ? dateValue(cell) : textValue(cell);
      if (value) {
        raw[def.field] = value;
        hasValue = true;
      }
    }
    if (!hasValue) continue;
    if (rows.length + errors.length >= MAX_EMPLOYEE_IMPORT_ROWS) {
      throw new EmployeeImportFileError(`Bir seferde en fazla ${MAX_EMPLOYEE_IMPORT_ROWS} çalışan içe aktarılabilir`);
    }
    const parsed = employeeBody.safeParse(raw);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const def = EMPLOYEE_COLUMNS.find((c) => c.field === issue.path[0]);
        const empty = def && raw[def.field] === undefined;
        errors.push({ row: r, column: def?.label, message: empty ? 'Bu sütun boş bırakılamaz' : issue.message });
      }
      continue;
    }
    const dup = seen.get(parsed.data.nationalId);
    if (dup) {
      errors.push({ row: r, column: 'T.C. Kimlik No', message: `Bu T.C. kimlik no ${dup}. satırda da var` });
      continue;
    }
    seen.set(parsed.data.nationalId, r);
    rows.push({ row: r, data: parsed.data });
  }
  return { rows, errors };
}

/** Boş içe aktarma şablonu. */
export async function employeesTemplateXlsx(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Çalışanlar');
  sheet.columns = EMPLOYEE_COLUMNS.map((c) => ({ header: c.label, key: c.field, width: c.field === 'email' ? 32 : 20 }));
  sheet.getRow(1).font = { bold: true };
  // T.C. no ve telefon metin olarak girilsin (baştaki 0 ve uzun sayılar bozulmasın).
  for (const key of ['nationalId', 'phone']) sheet.getColumn(key).numFmt = '@';
  sheet.getColumn('hireDate').numFmt = 'dd.mm.yyyy';
  sheet.getColumn('terminationDate').numFmt = 'dd.mm.yyyy';
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
