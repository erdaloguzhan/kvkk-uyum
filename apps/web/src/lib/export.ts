'use client';

import { apiFetch } from './api';

export interface ExportColumn<T> {
  label: string;
  value: (row: T) => string | number | boolean | null | undefined;
}

/** Ekrandaki tabloyu Excel (.xlsx) dosyası olarak indirir. */
export async function exportXlsx<T>(fileName: string, columns: ExportColumn<T>[], rows: T[]) {
  const body = {
    fileName,
    columns: columns.map((c, i) => ({ key: `c${i}`, label: c.label })),
    rows: rows.map((r) => Object.fromEntries(columns.map((c, i) => [`c${i}`, c.value(r) ?? null]))),
  };
  const res = await apiFetch('export/xlsx', { method: 'POST', body });
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = `${fileName}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
