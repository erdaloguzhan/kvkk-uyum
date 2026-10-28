'use client';

import { DSR_CHANNELS, DSR_OUTCOMES, DSR_RELATIONSHIPS, DSR_REQUEST_ITEMS, DSR_STATUSES } from '@kvkk/shared';
import Link from 'next/link';
import { useState } from 'react';
import { ExportButton } from '@/components/export-button';
import { ErrorAlert, Loading, PageHeader, Stat } from '@/components/ui';
import { formatDay } from '@/lib/labels';
import type { DataSubjectRequestReport } from '@/lib/types';
import { useApi } from '@/lib/use-api';

const yearStart = () => `${new Date().getFullYear()}-01-01`;
const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const monthLabel = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

interface Row {
  label: string;
  count: number;
}

/** Başvuruların dağılımı ve cevap süreleri; dönem başvuru tarihine göre seçilir. */
export default function RequestsReportPage() {
  const [from, setFrom] = useState(yearStart());
  const [to, setTo] = useState('');
  const report = useApi<DataSubjectRequestReport>('data-subject-requests/report', { from, to });
  const r = report.data;

  const sections: { title: string; rows: Row[] }[] = r
    ? [
        { title: 'Talep maddesine göre', rows: r.byItem.map((i) => ({ label: `${i.no}. ${DSR_REQUEST_ITEMS[i.no - 1].short}`, count: i.count })) },
        { title: 'Duruma göre', rows: r.byStatus.map((s) => ({ label: DSR_STATUSES[s.key], count: s.count })) },
        { title: 'Sonuca göre (cevaplananlar)', rows: r.byOutcome.map((s) => ({ label: DSR_OUTCOMES[s.key], count: s.count })) },
        { title: 'Başvuranın ilişkisine göre', rows: r.byRelationship.map((s) => ({ label: DSR_RELATIONSHIPS[s.key].label, count: s.count })) },
        { title: 'Başvuru yoluna göre', rows: r.byChannel.map((s) => ({ label: DSR_CHANNELS[s.key], count: s.count })) },
      ]
    : [];

  return (
    <>
      <p className="small">
        <Link href="/basvurular">← İlgili kişi başvuruları</Link>
      </p>
      <PageHeader title="Başvuru raporu" description="Seçilen dönemde alınan başvurular, sonuçları ve cevap süreleri." />
      <div className="toolbar">
        <label className="small">
          Başlangıç <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Başlangıç tarihi" />
        </label>
        <label className="small">
          Bitiş <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Bitiş tarihi" />
        </label>
        {r && (
          <ExportButton
            fileName={`Başvuru raporu ${from ? formatDay(from) : ''}${to ? ` - ${formatDay(to)}` : ''}`.trim()}
            rows={[
              { group: 'Özet', label: 'Toplam başvuru', count: r.total },
              { group: 'Özet', label: 'Açık başvuru', count: r.open },
              { group: 'Özet', label: 'Cevaplanan', count: r.answered },
              { group: 'Özet', label: 'Ortalama cevap süresi (gün)', count: r.averageResponseDays ?? '' },
              { group: 'Özet', label: `${r.targetDays} gün içinde cevaplanan`, count: r.answeredWithinTarget },
              { group: 'Özet', label: `${r.legalDays} gün içinde cevaplanan`, count: r.answeredWithinLegal },
              { group: 'Özet', label: `${r.legalDays} günden geç cevaplanan`, count: r.answeredLate },
              { group: 'Özet', label: 'Açık ve hedefi geçen', count: r.openPastTarget },
              { group: 'Özet', label: 'Açık ve yasal süresi geçen', count: r.openPastLegal },
              ...sections.flatMap((s) => s.rows.map((row) => ({ group: s.title, label: row.label, count: row.count }))),
              ...r.byMonth.map((m) => ({ group: 'Aylara göre (alınan / cevaplanan)', label: monthLabel(m.month), count: `${m.received} / ${m.answered}` })),
            ]}
            columns={[
              { label: 'Bölüm', value: (x) => x.group },
              { label: 'Kalem', value: (x) => x.label },
              { label: 'Değer', value: (x) => x.count },
            ]}
          />
        )}
      </div>
      <ErrorAlert error={report.error} />
      {!r ? (
        <Loading />
      ) : (
        <>
          <div className="grid grid-4" style={{ marginBottom: 16 }}>
            <Stat label="Toplam başvuru" value={r.total} />
            <Stat label="Açık başvuru" value={r.open} tone={r.openPastLegal ? 'bad' : r.openPastTarget ? 'warn' : undefined} />
            <Stat label="Cevaplanan" value={r.answered} />
            <Stat label="Ortalama cevap süresi" value={r.averageResponseDays === null ? '—' : `${r.averageResponseDays} gün`} />
            <Stat label={`${r.targetDays} gün içinde cevaplanan`} value={r.answeredWithinTarget} />
            <Stat label={`${r.legalDays} günden geç cevaplanan`} value={r.answeredLate} tone={r.answeredLate ? 'bad' : undefined} />
            <Stat label="Açık, kurum içi hedefi geçen" value={r.openPastTarget} tone={r.openPastTarget ? 'warn' : undefined} />
            <Stat label="Açık, yasal süresi geçen" value={r.openPastLegal} tone={r.openPastLegal ? 'bad' : undefined} />
          </div>
          {r.total === 0 ? (
            <div className="card">
              <p className="muted" style={{ margin: 0 }}>
                Bu dönemde başvuru yok.
              </p>
            </div>
          ) : (
            <div className="grid grid-2">
              {sections.map((s) => (
                <div key={s.title} className="card">
                  <h2>{s.title}</h2>
                  <Bars rows={s.rows} />
                </div>
              ))}
              <div className="card">
                <h2>Aylara göre</h2>
                <table>
                  <thead>
                    <tr>
                      <th>Ay</th>
                      <th>Alınan</th>
                      <th>Cevaplanan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.byMonth.map((m) => (
                      <tr key={m.month}>
                        <td>{monthLabel(m.month)}</td>
                        <td>{m.received}</td>
                        <td>{m.answered}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}

function Bars({ rows }: { rows: Row[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="report-bars">
      {rows.map((row) => (
        <div key={row.label} className="report-bar">
          <span>{row.label}</span>
          <span className="bar" aria-hidden>
            <span style={{ width: `${(row.count / max) * 100}%` }} />
          </span>
          <span className="num">{row.count}</span>
        </div>
      ))}
    </div>
  );
}
