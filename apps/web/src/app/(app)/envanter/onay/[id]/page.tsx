'use client';

import { PERMISSIONS } from '@kvkk/shared';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { NoteDialog } from '@/components/approval-dialogs';
import { approvalBadge, InventoryChanges } from '@/components/inventory-approval';
import { Alert, ErrorAlert, Loading, PageHeader } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { formatDateTime, formatDay } from '@/lib/labels';
import { useSession } from '@/lib/session';
import type { InventoryApproval } from '@/lib/types';
import { useApi } from '@/lib/use-api';

/** Envanter onay talebi: gönderilen değişiklikler ve Yöneticinin kararı. */
export default function InventoryApprovalPage() {
  const { id } = useParams<{ id: string }>();
  const { me, can } = useSession();
  const request = useApi<InventoryApproval>(`inventory/approval-requests/${id}`);
  const [dialog, setDialog] = useState<'approve' | 'reject' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (request.loading && !request.data) return <Loading />;
  if (!request.data) return <ErrorAlert error={request.error} />;
  const r = request.data;
  const pending = r.status === 'pending';
  const canDecide = pending && r.approver.id === me?.id && can(PERMISSIONS.INVENTORY_APPROVE);

  async function act(path: string, body: object | undefined, done: string) {
    setBusy(true);
    setError(null);
    try {
      await api(`inventory/approval-requests/${id}/${path}`, { method: 'POST', body });
      setDialog(null);
      setMessage(done);
      await request.reload();
      window.dispatchEvent(new Event('kvkk:notifications'));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <p className="small">
        <Link href="/envanter">← Veri envanteri</Link> · <Link href="/envanter/onay">Onay geçmişi</Link>
      </p>
      <PageHeader
        title="Envanter değişiklikleri onayı"
        description={`${r.changes.length} satırda değişiklik`}
        actions={
          canDecide && (
            <>
              <button className="btn btn-primary" onClick={() => setDialog('approve')} disabled={busy}>
                Onayla
              </button>
              <button className="btn btn-danger" onClick={() => setDialog('reject')} disabled={busy}>
                Reddet
              </button>
            </>
          )
        }
      />
      <ErrorAlert error={error} />
      {message && <Alert kind="success">{message}</Alert>}
      <div className="card">
        <dl className="details">
          <dt>Durum</dt>
          <dd>{approvalBadge(r.status)}</dd>
          <dt>Gönderen</dt>
          <dd>
            {r.requestedBy?.fullName ?? '—'} · {formatDateTime(r.createdAt)}
          </dd>
          <dt>Onaylayacak kişi</dt>
          <dd>
            {r.approver.fullName}
            {pending && r.dueDate && <span className="muted"> · son tarih {formatDay(r.dueDate)}</span>}
          </dd>
          {r.note && (
            <>
              <dt>Not</dt>
              <dd style={{ whiteSpace: 'pre-wrap' }}>{r.note}</dd>
            </>
          )}
          {r.decidedAt && (
            <>
              <dt>Karar</dt>
              <dd>
                {r.decidedBy?.fullName ?? '—'} · {formatDateTime(r.decidedAt)}
                {r.decisionNote && <div style={{ whiteSpace: 'pre-wrap' }}>{r.decisionNote}</div>}
              </dd>
            </>
          )}
        </dl>
      </div>
      {pending && can(PERMISSIONS.INVENTORY_WRITE) && (
        <div className="actions" style={{ marginBottom: 16 }}>
          <button
            className="btn"
            disabled={busy}
            onClick={() => confirm('Onay talebi geri alınsın mı?') && act('cancel', undefined, 'Onay talebi geri alındı.')}
          >
            Talebi geri al
          </button>
        </div>
      )}
      <div className="card">
        <h2>Gönderilen değişiklikler</h2>
        <p className="small muted">
          Talep gönderildiği andaki envanteri gösterir. Bu tarihten sonra yapılan değişiklikler bir sonraki onay talebine girer.
        </p>
        <InventoryChanges changes={r.changes} />
      </div>
      {dialog === 'approve' && (
        <NoteDialog
          title="Değişiklikleri onayla"
          text="Onay, talebin gönderildiği andaki envanter için kaydedilir ve gönderen kişiye bildirilir."
          submitLabel="Onayla"
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(note) => act('approve', { note: note || null }, 'Envanter değişiklikleri onaylandı.')}
        />
      )}
      {dialog === 'reject' && (
        <NoteDialog
          title="Değişiklikleri reddet"
          text="Ret gerekçesi gönderen kişiye iletilir. Değişiklikler envanterde kalır, onaysız olarak işaretlenir."
          submitLabel="Reddet"
          required
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(note) => act('reject', { note }, 'Talep reddedildi.')}
        />
      )}
    </>
  );
}
