'use client';

import { SUPPORT_CATEGORIES } from '@kvkk/shared';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { responseTime, SupportStatusBadge } from '@/components/support-status';
import { ReplyForm, SupportThread } from '@/components/support-thread';
import { ErrorAlert, Loading, PageHeader } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { formatDateTime } from '@/lib/labels';
import type { SupportTicketDetail } from '@/lib/types';
import { useApi } from '@/lib/use-api';

interface Staff {
  id: string;
  fullName: string;
  email: string;
}

/** Yönetim paneli menüsündeki sayaç yenilensin. */
const refreshMenu = () => window.dispatchEvent(new Event('kvkk:support'));

export default function AdminTicketPage() {
  const { id } = useParams<{ id: string }>();
  const ticket = useApi<SupportTicketDetail>(`admin/support/tickets/${id}`);
  const staff = useApi<{ items: Staff[] }>('admin/support/staff');
  const [error, setError] = useState<string | null>(null);

  if (ticket.loading && !ticket.data) return <Loading />;
  if (!ticket.data) return <ErrorAlert error={ticket.error} />;
  const t = ticket.data;

  async function update(body: Record<string, unknown>) {
    setError(null);
    try {
      ticket.setData(await api<SupportTicketDetail>(`admin/support/tickets/${t.id}`, { method: 'PATCH', body }));
      refreshMenu();
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <>
      <p className="small">
        <Link href="/admin/destek">← Destek talepleri</Link>
      </p>
      <PageHeader
        title={`#${t.number} ${t.subject}`}
        description={
          <>
            {SUPPORT_CATEGORIES[t.category]} · {formatDateTime(t.createdAt)} <SupportStatusBadge status={t.status} />
          </>
        }
        actions={
          t.status === 'closed' ? (
            <button className="btn" onClick={() => update({ status: 'open' })}>
              Yeniden aç
            </button>
          ) : (
            <button className="btn" onClick={() => confirm('Talep kapatılsın mı? Kullanıcıya e-posta gider.') && update({ status: 'closed' })}>
              Talebi kapat
            </button>
          )
        }
      />
      <ErrorAlert error={error} />
      <div className="card">
        <dl className="details">
          <dt>Kuruluş</dt>
          <dd>
            <Link href={`/admin/kuruluslar/${t.organizationId}`}>{t.organizationName}</Link>
          </dd>
          <dt>Açan</dt>
          <dd>
            {t.createdByName ?? '—'}
            {t.createdByEmail && (
              <>
                {' '}
                · <a href={`mailto:${t.createdByEmail}`}>{t.createdByEmail}</a>
              </>
            )}
          </dd>
          <dt>İlk yanıt süresi</dt>
          <dd>{responseTime(t.createdAt, t.firstResponseAt)}</dd>
          <dt>Sorumlu</dt>
          <dd>
            <select aria-label="Sorumlu" value={t.assigneeId ?? ''} onChange={(e) => update({ assigneeId: e.target.value || null })}>
              <option value="">Atanmamış</option>
              {(staff.data?.items ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.fullName} ({s.email})
                </option>
              ))}
            </select>
          </dd>
        </dl>
      </div>
      <div className="card">
        <SupportThread messages={t.messages} showStaffName />
      </div>
      <div className="card">
        <ReplyForm
          extraAction="Yanıtla ve kapat"
          onSend={async (form, close) => {
            form.append('close', String(close));
            ticket.setData(await api<SupportTicketDetail>(`admin/support/tickets/${t.id}/messages`, { method: 'POST', body: form }));
            refreshMenu();
          }}
        />
      </div>
    </>
  );
}
