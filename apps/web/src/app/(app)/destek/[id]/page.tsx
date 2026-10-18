'use client';

import { SUPPORT_CATEGORIES } from '@kvkk/shared';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { SupportStatusBadge } from '@/components/support-status';
import { ReplyForm, SupportThread } from '@/components/support-thread';
import { Alert, ErrorAlert, Loading, PageHeader } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { formatDateTime } from '@/lib/labels';
import type { SupportTicketDetail } from '@/lib/types';
import { useApi } from '@/lib/use-api';

export default function TicketPage() {
  const { id } = useParams<{ id: string }>();
  const ticket = useApi<SupportTicketDetail>(`support/tickets/${id}`);
  const [error, setError] = useState<string | null>(null);

  if (ticket.loading && !ticket.data) return <Loading />;
  if (!ticket.data) return <ErrorAlert error={ticket.error} />;
  const t = ticket.data;

  async function close() {
    if (!confirm('Talep kapatılsın mı? Daha sonra yeniden yazarsanız talep tekrar açılır.')) return;
    try {
      ticket.setData(await api<SupportTicketDetail>(`support/tickets/${t.id}/close`, { method: 'POST' }));
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <>
      <p className="small">
        <Link href="/destek">← Destek</Link>
      </p>
      <PageHeader
        title={`#${t.number} ${t.subject}`}
        description={
          <>
            {SUPPORT_CATEGORIES[t.category]} · {t.createdByName ?? '—'} · {formatDateTime(t.createdAt)} <SupportStatusBadge status={t.status} />
          </>
        }
        actions={
          t.status !== 'closed' && (
            <button className="btn" onClick={close}>
              Talebi kapat
            </button>
          )
        }
      />
      <ErrorAlert error={error} />
      <div className="card">
        <SupportThread messages={t.messages} showStaffName={false} />
      </div>
      <div className="card">
        <ReplyForm
          note={t.status === 'closed' && <Alert kind="info">Bu talep kapatıldı. Yanıt yazarsanız talep yeniden açılır.</Alert>}
          onSend={async (form) => {
            ticket.setData(await api<SupportTicketDetail>(`support/tickets/${t.id}/messages`, { method: 'POST', body: form }));
          }}
        />
      </div>
    </>
  );
}
