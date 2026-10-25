'use client';

import { ReactNode, useState } from 'react';
import { download, errorText } from '@/lib/api';
import { ExportColumn } from '@/lib/export';
import { formatDateTime } from '@/lib/labels';
import type { TrainingResult } from '@/lib/types';
import { Badge, Empty } from './ui';

export function statusOf(r: TrainingResult): { label: string; kind?: 'success' | 'warning' | 'danger' | 'info' } {
  if (r.passed) return { label: 'Başarılı', kind: 'success' };
  if (r.passed === false) return { label: 'Başarısız', kind: 'danger' };
  if (r.startedAt) return { label: 'Devam ediyor', kind: 'info' };
  if (r.sentAt) return { label: 'Gönderildi', kind: 'warning' };
  return { label: 'Gönderilmedi' };
}

/** Sınav sonuçları için Excel sütunları (ekrandaki tabloyla aynı). */
export const RESULT_EXPORT_COLUMNS: ExportColumn<TrainingResult>[] = [
  { label: 'Eğitim grubu', value: (r) => r.groupName },
  { label: 'Kuruluş', value: (r) => r.organizationName },
  { label: 'Eğitim', value: (r) => r.trainingName },
  { label: 'T.C. Kimlik No', value: (r) => r.nationalId },
  { label: 'Adı Soyadı', value: (r) => r.fullName },
  { label: 'Eğitim gönderim tarihi', value: (r) => (r.sentAt ? formatDateTime(r.sentAt) : null) },
  { label: 'Eğitime başlama', value: (r) => (r.startedAt ? formatDateTime(r.startedAt) : null) },
  { label: 'Eğitimi bitirme', value: (r) => (r.completedAt ? formatDateTime(r.completedAt) : null) },
  { label: 'Ön test notu', value: (r) => r.preTestScore },
  { label: 'Eğitim notu (son test)', value: (r) => r.postTestScore },
  { label: 'Son test deneme sayısı', value: (r) => r.postTestAttempts },
  { label: 'Durum', value: (r) => statusOf(r).label },
];

/** Katılımcı/sonuç tablosu; başarılı katılımcı için sertifika oluşturulur. */
export function ResultsTable({
  rows,
  showGroup = true,
  actions,
}: {
  rows: TrainingResult[];
  showGroup?: boolean;
  actions?: (r: TrainingResult) => ReactNode;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  async function certificate(r: TrainingResult) {
    setBusy(r.id);
    try {
      await download(`training-admin/participants/${r.id}/certificate`, `Sertifika - ${r.fullName}.pdf`);
    } catch (err) {
      alert(errorText(err));
    } finally {
      setBusy(null);
    }
  }

  if (rows.length === 0) return <Empty title="Kayıt yok" />;
  return (
    <div className="table-wrap" style={{ border: 0 }}>
      <table>
        <thead>
          <tr>
            {showGroup && <th>Eğitim grubu</th>}
            <th>T.C. Kimlik No</th>
            <th>Adı Soyadı</th>
            <th>Eğitim gönderim tarihi</th>
            <th>Eğitime başlama</th>
            <th>Eğitimi bitirme</th>
            <th>Ön test</th>
            <th>Eğitim notu</th>
            <th>Sertifika</th>
            {actions && <th />}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const status = statusOf(r);
            return (
              <tr key={r.id}>
                {showGroup && (
                  <td>
                    {r.groupName}
                    <div className="muted small">{r.organizationName}</div>
                  </td>
                )}
                <td className="nowrap">{r.nationalId}</td>
                <td>
                  {r.fullName}
                  {!r.email && (
                    <div>
                      <Badge kind="warning">E-posta yok</Badge>
                    </div>
                  )}
                </td>
                <td className="nowrap">{r.sentAt ? formatDateTime(r.sentAt) : <Badge>Gönderilmedi</Badge>}</td>
                <td className="nowrap">{formatDateTime(r.startedAt)}</td>
                <td className="nowrap">{formatDateTime(r.completedAt)}</td>
                <td>{r.preTestScore ?? '—'}</td>
                <td>
                  {r.postTestScore ?? '—'}
                  {r.postTestAttempts > 1 && <div className="muted small">{r.postTestAttempts} deneme</div>}
                </td>
                <td className="nowrap">
                  {r.passed ? (
                    <button className="btn btn-small btn-primary" disabled={busy === r.id} onClick={() => certificate(r)}>
                      {busy === r.id ? 'Hazırlanıyor…' : 'Sertifika oluştur'}
                    </button>
                  ) : r.passed === false || r.startedAt ? (
                    <Badge kind={status.kind}>{status.label}</Badge>
                  ) : (
                    '—'
                  )}
                </td>
                {actions && <td className="nowrap">{actions(r)}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
