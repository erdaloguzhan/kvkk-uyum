'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert, Field, PageHeader } from '@/components/ui';
import { api, ApiError, ApiErrorBody, errorText } from '@/lib/api';
import type { InventoryEntry } from '@/lib/types';

type Mode = 'append' | 'replace';
type Preview = { count: number; rows: (Partial<InventoryEntry> & { row: number })[] };

export default function InventoryImportPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<Mode>('append');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<{ text: string; rows?: ApiErrorBody['errors'] } | null>(null);
  const [busy, setBusy] = useState(false);

  async function send(dryRun: boolean) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await api<Preview & { removed?: number }>('inventory/import', {
        method: 'POST',
        body: form,
        query: { dryRun, mode },
      });
      if (dryRun) setPreview(res);
      else router.push('/envanter');
    } catch (err) {
      setPreview(null);
      setError({ text: errorText(err), rows: err instanceof ApiError ? err.body.errors : undefined });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <p className="small">
        <Link href="/envanter">← Envanter</Link>
      </p>
      <PageHeader
        title="Excel'den içe aktar"
        description="TBL-010 Kişisel Veri Envanteri Tablosu biçimindeki Excel dosyanızı yükleyin. Önce kontrol edilir, onaylarsanız kaydedilir."
      />
      <div className="card">
        <div className="form">
          <Field label="Excel dosyası (.xlsx)" htmlFor="file" hint="En fazla 5 MB. Sütun başlıkları TBL-010'daki gibi olmalı.">
            <input
              id="file"
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setPreview(null);
                setError(null);
              }}
            />
          </Field>
          <div className="field">
            <span className="field-label">Mevcut envanter</span>
            <label className="checkbox">
              <input type="radio" name="mode" checked={mode === 'append'} onChange={() => setMode('append')} />
              Dosyadaki satırları mevcut envantere ekle
            </label>
            <label className="checkbox">
              <input type="radio" name="mode" checked={mode === 'replace'} onChange={() => setMode('replace')} />
              Mevcut envanteri sil, dosyadakilerle değiştir
            </label>
          </div>
          <div>
            <button className="btn btn-primary" onClick={() => send(true)} disabled={!file || busy}>
              {busy && !preview ? 'Kontrol ediliyor…' : 'Dosyayı kontrol et'}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <Alert kind="error">
          <p>{error.text}</p>
          {error.rows && error.rows.length > 0 && (
            <ul>
              {error.rows.slice(0, 50).map((r, i) => (
                <li key={i}>
                  {r.row ? `Satır ${r.row}` : 'Dosya'}
                  {r.column ? `, ${r.column}` : ''}: {r.message}
                </li>
              ))}
              {error.rows.length > 50 && <li>… ve {error.rows.length - 50} hata daha</li>}
            </ul>
          )}
        </Alert>
      )}

      {preview && (
        <div className="card">
          <div className="card-header">
            <h2>{preview.count} satır içe aktarılmaya hazır</h2>
            <button className="btn btn-primary" onClick={() => send(false)} disabled={busy}>
              {busy ? 'Kaydediliyor…' : mode === 'replace' ? 'Envanteri değiştir' : 'Envantere ekle'}
            </button>
          </div>
          {mode === 'replace' && (
            <Alert kind="warning">Mevcut envanterdeki tüm satırlar silinecek ve yerine bu dosyadakiler gelecek.</Alert>
          )}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Excel satırı</th>
                  <th>Departman</th>
                  <th>Faaliyet</th>
                  <th>Veri kategorisi</th>
                  <th>Saklama süresi</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.slice(0, 100).map((r) => (
                  <tr key={r.row}>
                    <td>{r.row}</td>
                    <td>{r.department}</td>
                    <td>{r.activity}</td>
                    <td>{r.dataCategory}</td>
                    <td>{r.retentionPeriod ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.rows.length > 100 && <p className="small muted">İlk 100 satır gösteriliyor.</p>}
        </div>
      )}
    </>
  );
}
