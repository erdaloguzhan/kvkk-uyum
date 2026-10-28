'use client';

import { DSR_CHANNELS, DSR_OUTCOMES, DSR_RELATIONSHIPS, DSR_REQUEST_ITEMS, DSR_STATUSES, DsrStatus, PERMISSIONS } from '@kvkk/shared';
import Link from 'next/link';
import { useState } from 'react';
import { ExportButton } from '@/components/export-button';
import { requestStatusBadge } from '@/components/request-status';
import { Alert, Badge, Empty, ErrorAlert, Loading, PageHeader } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { formatDate, formatDay } from '@/lib/labels';
import { useSession } from '@/lib/session';
import type { DataSubjectRequestSummary, RequestFormSettings } from '@/lib/types';
import { useApi } from '@/lib/use-api';

const itemShort = new Map(DSR_REQUEST_ITEMS.map((i) => [i.no, i.short]));

export default function RequestsPage() {
  const { can } = useSession();
  const canManage = can(PERMISSIONS.REQUESTS_MANAGE);
  const [status, setStatus] = useState<DsrStatus | ''>('');
  const [overdue, setOverdue] = useState(false);
  const [q, setQ] = useState('');
  const list = useApi<{ items: DataSubjectRequestSummary[] }>('data-subject-requests', {
    status,
    q: q.trim(),
    overdue: overdue ? 'true' : undefined,
  });
  const items = list.data?.items ?? [];
  const filtered = status !== '' || overdue || q.trim() !== '';

  return (
    <>
      <PageHeader
        title="İlgili kişi başvuruları"
        description="Veri sahiplerinin KVKK md. 11 kapsamındaki başvuruları (FRM-010) ve cevapları."
        actions={
          <>
            <Link className="btn" href="/basvurular/rapor">
              Rapor
            </Link>
            {canManage && (
              <Link className="btn btn-primary" href="/basvurular/yeni">
                + Başvuru kaydet
              </Link>
            )}
          </>
        }
      />
      <FormSettingsCard canManage={canManage} />
      <div className="toolbar">
        <input type="search" placeholder="Ad, e-posta, telefon veya başvuru no" aria-label="Ara" value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Durum" value={status} onChange={(e) => setStatus(e.target.value as DsrStatus | '')}>
          <option value="">Tüm durumlar</option>
          {(Object.keys(DSR_STATUSES) as DsrStatus[]).map((s) => (
            <option key={s} value={s}>
              {DSR_STATUSES[s]}
            </option>
          ))}
        </select>
        <label className="checkbox">
          <input type="checkbox" checked={overdue} onChange={(e) => setOverdue(e.target.checked)} /> Yalnızca süresi geçenler
        </label>
        <ExportButton
          fileName="İlgili kişi başvuruları"
          rows={items}
          columns={[
            { label: 'Başvuru no', value: (r) => r.code },
            { label: 'Başvuru tarihi', value: (r) => formatDate(r.receivedAt) },
            { label: 'Başvuru yolu', value: (r) => DSR_CHANNELS[r.channel] },
            { label: 'Ad soyad', value: (r) => r.fullName },
            { label: 'İlişki', value: (r) => (r.relationship ? DSR_RELATIONSHIPS[r.relationship].label : '') },
            { label: 'Talepler', value: (r) => r.items.map((i) => `${i.no}. ${itemShort.get(i.no)}`).join('; ') },
            { label: 'Durum', value: (r) => DSR_STATUSES[r.status] },
            { label: 'Kurum içi hedef', value: (r) => formatDay(r.targetDate) },
            { label: 'Yasal son gün', value: (r) => formatDay(r.legalDueDate) },
            { label: 'Cevap tarihi', value: (r) => (r.answeredOn ? formatDay(r.answeredOn) : '') },
            { label: 'Sonuç', value: (r) => (r.answerOutcome ? DSR_OUTCOMES[r.answerOutcome] : '') },
            { label: 'Cevap süresi (gün)', value: (r) => r.responseDays },
            { label: 'Sorumlu', value: (r) => r.assignee?.fullName ?? '' },
          ]}
        />
      </div>
      <ErrorAlert error={list.error} />
      {list.loading && !list.data ? (
        <Loading />
      ) : items.length === 0 ? (
        <div className="card">
          <Empty title={filtered ? 'Aramaya uyan başvuru yok' : 'Henüz başvuru yok'}>
            {!filtered && <p className="muted">Online formdan gelen veya elden/noterden alınıp kaydedilen başvurular burada listelenir.</p>}
          </Empty>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>No</th>
                <th>Başvuru tarihi</th>
                <th>Başvuran</th>
                <th>Talepler</th>
                <th>Durum</th>
                <th>Yasal son gün</th>
                <th>Sorumlu</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id}>
                  <td className="nowrap">
                    <Link href={`/basvurular/${r.id}`}>{r.code}</Link>
                  </td>
                  <td className="nowrap">
                    {formatDate(r.receivedAt)}
                    <div className="small muted">{DSR_CHANNELS[r.channel]}</div>
                  </td>
                  <td>
                    <Link href={`/basvurular/${r.id}`}>{r.fullName}</Link>
                    {r.relationship && <div className="small muted">{DSR_RELATIONSHIPS[r.relationship].label}</div>}
                  </td>
                  <td className="small">{r.items.map((i) => itemShort.get(i.no)).join(', ')}</td>
                  <td>{requestStatusBadge(r)}</td>
                  <td className="nowrap">{r.status === 'answered' ? <span className="muted">Cevap {formatDay(r.answeredOn)}</span> : formatDay(r.legalDueDate)}</td>
                  <td>{r.assignee?.fullName ?? <span className="muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/** Kuruluşun herkese açık başvuru formu: bağlantı, web sitesine ekleme kodu, açma/kapama ve adres yenileme. */
function FormSettingsCard({ canManage }: { canManage: boolean }) {
  const settings = useApi<RequestFormSettings>('data-subject-requests/form-settings');
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const s = settings.data;

  async function act(fn: () => Promise<RequestFormSettings>, done: string) {
    setBusy(true);
    setError(null);
    try {
      settings.setData(await fn());
      setMessage(done);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      setMessage(`${what} kopyalandı.`);
    } catch {
      setError('Kopyalanamadı; metni seçip elle kopyalayın.');
    }
  }

  if (!s) return <ErrorAlert error={settings.error} />;
  return (
    <div className="card">
      <div className="card-header">
        <h2>
          Online başvuru formu {s.enabled ? <Badge kind="success">Açık</Badge> : <Badge kind="danger">Kapalı</Badge>}
        </h2>
        <button type="button" className="btn btn-small" onClick={() => setOpen(!open)}>
          {open ? 'Gizle' : 'Web sitesine ekleme'}
        </button>
      </div>
      <p className="small" style={{ margin: 0 }}>
        <a href={s.url} target="_blank" rel="noreferrer">
          {s.url}
        </a>{' '}
        <button type="button" className="btn-link small" onClick={() => copy(s.url, 'Bağlantı')}>
          Kopyala
        </button>
      </p>
      {message && <Alert kind="success">{message}</Alert>}
      <ErrorAlert error={error} />
      {open && (
        <div className="form" style={{ marginTop: 12 }}>
          <p className="small muted" style={{ margin: 0 }}>
            Bu bağlantıyı kurumunuzun web sitesine “KVKK Başvuru Formu” bağlantısı veya düğmesi olarak koyabilirsiniz. Formu sayfanın
            içinde göstermek isterseniz aşağıdaki kodu web sitenizin ilgili sayfasına ekleyin. Dışarıdan erişilebilen yalnızca bu formdur;
            başvurular buraya düşer ve KVKK Sorumlusuna görev olarak atanır.
          </p>
          <textarea className="embed-code" rows={3} readOnly value={s.embedCode} onFocus={(e) => e.target.select()} />
          <div className="actions">
            <button type="button" className="btn btn-small" onClick={() => copy(s.embedCode, 'Kod')}>
              Kodu kopyala
            </button>
            {canManage && (
              <>
                <button
                  type="button"
                  className="btn btn-small"
                  disabled={busy}
                  onClick={() => act(() => api<RequestFormSettings>('data-subject-requests/form-settings', { method: 'PATCH', body: { enabled: !s.enabled } }), s.enabled ? 'Form kapatıldı.' : 'Form açıldı.')}
                >
                  {s.enabled ? 'Formu kapat' : 'Formu aç'}
                </button>
                <button
                  type="button"
                  className="btn btn-small btn-danger"
                  disabled={busy}
                  onClick={() => {
                    if (!confirm('Yeni bir form adresi oluşturulsun mu? Eski bağlantı ve web sitesine eklenmiş eski kod çalışmaz olur.')) return;
                    act(() => api('data-subject-requests/form-settings/regenerate', { method: 'POST' }), 'Yeni form adresi oluşturuldu. Web sitenizdeki bağlantıyı güncelleyin.');
                  }}
                >
                  Adresi yenile
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
