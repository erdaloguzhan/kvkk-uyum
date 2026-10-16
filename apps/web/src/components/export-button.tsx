'use client';

import { useState } from 'react';
import { errorText } from '@/lib/api';
import { ExportColumn, exportXlsx } from '@/lib/export';

/** Tablonun üstündeki "Excel'e aktar" düğmesi. */
export function ExportButton<T>({ fileName, columns, rows }: { fileName: string; columns: ExportColumn<T>[]; rows: T[] }) {
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    try {
      await exportXlsx(fileName, columns, rows);
    } catch (err) {
      alert(errorText(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <button type="button" className="btn" onClick={run} disabled={busy || rows.length === 0}>
      {busy ? 'Hazırlanıyor…' : "Excel'e aktar"}
    </button>
  );
}
