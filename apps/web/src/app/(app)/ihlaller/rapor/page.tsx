'use client';

import { INCIDENT_LIKELIHOODS, INCIDENT_NOTIFY_DEADLINE_HOURS, IncidentLikelihood } from '@kvkk/shared';
import Link from 'next/link';
import { useState } from 'react';
import { ExportButton } from '@/components/export-button';
import { deadlineBadge, incidentStatusBadge } from '@/components/incident-status';
import { Empty, ErrorAlert, Loading, PageHeader, Stat } from '@/components/ui';
import { INCIDENT_EXPORT_COLUMNS } from '@/lib/incident-export';
import { formatDateTime, formatDay } from '@/lib/labels';
import type { IncidentReport } from '@/lib/types';
import { useApi } from '@/lib/use-api';

function Bars({ rows }: { rows: { label: string; count: number }[] }) {
  if (rows.length === 0) return <p className="muted small">Kayıt yok</p>;
  const top = Math.max(...rows.map((r) => r.count));
  return (
    <ul className="bar-list">
      {rows.map((r) => (
        <li key={r.label}>
          <span>{r.label}</span>
          <span className="bar" style={{ width: `${(r.count / top) * 100}%` }} />
          <strong>{r.count}</strong>
        </li>
      ))}
    </ul>
  );
}

const likelihoodLabel = (k: string) => (k === 'unset' ? 'Seçilmemiş' : INCIDENT_LIKELIHOODS[k as IncidentLikelihood]);

export default function IncidentReportPage() {
  const year = new Date().getFullYear();
  const [from, setFrom] = useState(`${year}-01-01`);
  const [to, setTo] = useState('');
  const report = useApi<IncidentReport>('incidents/report', { from, to });
  const r = report.data;
  const period = `${from ? formatDay(from) : 'Başlangıç'} – ${to ? formatDay(to) : 'bugün'}`;

  return (
    <>
      <p className="small">
        <Link href="/ihlaller">← Veri ihlalleri</Link>
      </p>
      <PageHeader
        title="Veri ihlali raporu"
        description="Seçilen dönemde tespit edilen ihlallerin özeti. Sayılar ilk bildirimlere göredir; takip bildirimleri ayrıca gösterilir."
        actions={r && <ExportButton fileName={`Veri ihlali raporu ${period}`} columns={INCIDENT_EXPORT_COLUMNS} rows={r.items} />}
      />
      <div className="toolbar">
        <label className="small">
          Tespit tarihi{' '}
          <input type="date" aria-label="Başlangıç" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 'auto' }} />
        </label>
        <label className="small">
          –{' '}
          <input type="date" aria-label="Bitiş" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} style={{ width: 'auto' }} />
        </label>
        <button className="btn btn-small" onClick={() => (setFrom(''), setTo(''))}>
          Tüm zamanlar
        </button>
      </div>
      <ErrorAlert error={report.error} />
      {!r ? (
        <Loading />
      ) : (
        <>
          <div className="grid grid-4" style={{ marginBottom: 16 }}>
            <Stat label="Tespit edilen ihlal" value={r.total} />
            <Stat label="Bildirimi bekleyen" value={r.open} tone={r.open ? 'warn' : undefined} />
            <Stat label={`${INCIDENT_NOTIFY_DEADLINE_HOURS} saati geçen (bildirilmemiş)`} value={r.openOverdue} tone={r.openOverdue ? 'bad' : undefined} />
            <Stat label="Kurula bildirilen" value={r.notified} />
            <Stat label={`${INCIDENT_NOTIFY_DEADLINE_HOURS} saat içinde bildirilen`} value={r.notifiedOnTime} />
            <Stat label="Geç bildirilen" value={r.notifiedLate} tone={r.notifiedLate ? 'bad' : undefined} />
            <Stat label="Bildirim gerekmeyen" value={r.closedWithoutNotice} />
            <Stat label="Ortalama bildirim süresi" value={r.averageHoursToNotify === null ? '—' : `${r.averageHoursToNotify} saat`} />
            <Stat label="Etkilenen tahmini kişi" value={r.estimatedPeople.toLocaleString('tr-TR')} />
            <Stat label="Etkilenen tahmini kayıt" value={r.estimatedRecords.toLocaleString('tr-TR')} />
            <Stat label="Özel nitelikli veri içeren" value={r.specialCategoryIncidents} />
            <Stat label="Siber saldırı" value={r.cyberAttacks} />
          </div>
          <div className="grid grid-2">
            <div className="card">
              <h2>İhlalin kaynağı</h2>
              <Bars rows={r.bySource} />
            </div>
            <div className="card">
              <h2>Olumsuz etki olasılığı</h2>
              <Bars rows={r.byLikelihood.map((x) => ({ ...x, label: likelihoodLabel(x.label) }))} />
            </div>
          </div>
          <div className="card">
            <h2>Etkilenen veri kategorileri</h2>
            <Bars rows={r.byCategory} />
          </div>
          <div className="card">
            <h2>Dönemdeki kayıtlar ({r.items.length})</h2>
            {r.followUps > 0 && <p className="small muted">{r.followUps} takip bildirimi dahil.</p>}
            {r.items.length === 0 ? (
              <Empty title="Bu dönemde kayıt yok" />
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>No</th>
                      <th>Olay</th>
                      <th>Tespit</th>
                      <th>Durum</th>
                      <th>72 saat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.items.map((i) => (
                      <tr key={i.id}>
                        <td>#{i.number}</td>
                        <td>
                          <Link href={`/ihlaller/${i.id}`}>{i.title}</Link>
                        </td>
                        <td className="nowrap">{formatDateTime(i.detectedAt)}</td>
                        <td>{incidentStatusBadge(i.status)}</td>
                        <td>{deadlineBadge(i)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
