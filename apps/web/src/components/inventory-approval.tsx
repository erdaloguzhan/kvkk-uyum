'use client';

import { APPROVAL_STATUSES, ApprovalStatus, PERMISSIONS, STORAGE_MEDIA, StorageMedium } from '@kvkk/shared';
import Link from 'next/link';
import { useState } from 'react';
import { ApproverDialog } from './approval-dialogs';
import { Alert, Badge, ErrorAlert } from './ui';
import { api, errorText } from '@/lib/api';
import { fieldLabel, formatDateTime, formatDay } from '@/lib/labels';
import { useSession } from '@/lib/session';
import type { InventoryApprovalStatus, InventoryChange } from '@/lib/types';

export const APPROVAL_KIND: Record<ApprovalStatus, 'warning' | 'success' | 'danger' | undefined> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  cancelled: undefined,
};

export const CHANGE_KINDS: Record<InventoryChange['kind'], { label: string; kind: 'success' | 'warning' | 'danger' }> = {
  added: { label: 'Eklendi', kind: 'success' },
  updated: { label: 'Değişti', kind: 'warning' },
  deleted: { label: 'Silindi', kind: 'danger' },
};

export function approvalBadge(status: ApprovalStatus) {
  return <Badge kind={APPROVAL_KIND[status]}>{APPROVAL_STATUSES[status]}</Badge>;
}

function valueText(field: string, v: unknown) {
  if (v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0)) return '—';
  if (field === 'storageMedium') return STORAGE_MEDIA[v as StorageMedium] ?? String(v);
  return Array.isArray(v) ? v.join('; ') : String(v);
}

/** Son onaya göre eklenen, değişen (önceki → yeni değerleriyle) ve silinen envanter satırları. */
export function InventoryChanges({ changes }: { changes: InventoryChange[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Değişiklik</th>
            <th>Satır</th>
            <th>Ayrıntı</th>
          </tr>
        </thead>
        <tbody>
          {changes.map((c) => (
            <tr key={`${c.kind}-${c.entryId}`}>
              <td>
                <Badge kind={CHANGE_KINDS[c.kind].kind}>{CHANGE_KINDS[c.kind].label}</Badge>
              </td>
              <td>
                {c.kind === 'deleted' ? c.department : <Link href={`/envanter/${c.entryId}`}>{c.department}</Link>}
                <div className="small muted">
                  {c.activity} · {c.dataCategory}
                </div>
              </td>
              <td className="small">
                {c.kind === 'added' && 'Yeni satır'}
                {c.kind === 'deleted' && 'Satır envanterden silindi'}
                {c.fields?.map((f) => (
                  <div key={f.field} style={{ marginBottom: 6 }}>
                    <strong>{fieldLabel(f.field)}</strong>
                    <div>
                      <del className="muted">{valueText(f.field, f.before)}</del>
                    </div>
                    <div>{valueText(f.field, f.after)}</div>
                  </div>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Envanter sayfasının üstündeki onay kutusu: son onay, bekleyen talep ve onaylanmamış değişiklikler.
 * Sorumlu değişiklikleri onaya gönderir; Yönetici bekleyen talebi açıp karar verir.
 */
export function InventoryApprovalPanel({ status, onChange }: { status: InventoryApprovalStatus; onChange: () => Promise<void> }) {
  const { me, can } = useSession();
  const canWrite = can(PERMISSIONS.INVENTORY_WRITE);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const { lastApproved, pending, changes } = status;

  async function send(body: { approverId: string; dueDate: string | null; note: string | null }) {
    setBusy(true);
    setError(null);
    try {
      await api('inventory/approval-requests', { method: 'POST', body });
      setOpen(false);
      setMessage('Değişiklikler onaya gönderildi. Onaylayacak kişiye görev ve bildirim gitti.');
      await onChange();
      window.dispatchEvent(new Event('kvkk:notifications'));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h2>Yönetici onayı</h2>
          <div className="small muted">
            {lastApproved
              ? `Son onay: ${formatDateTime(lastApproved.decidedAt)} · ${lastApproved.decidedBy?.fullName ?? lastApproved.approver.fullName}`
              : 'Envanter henüz onaylanmadı.'}
          </div>
        </div>
        <div className="actions">
          <Link className="btn btn-small" href="/envanter/onay">
            Onay geçmişi
          </Link>
          {canWrite && !pending && changes.length > 0 && (
            <button className="btn btn-small btn-primary" onClick={() => setOpen(true)} disabled={busy}>
              Değişiklikleri onaya gönder
            </button>
          )}
        </div>
      </div>
      <ErrorAlert error={error} />
      {message && <Alert kind="success">{message}</Alert>}
      {pending ? (
        <Alert kind="warning">
          {pending.changes.length} satırlık değişiklik {pending.approver.fullName} onayında
          {pending.dueDate && <> (son tarih {formatDay(pending.dueDate)})</>}.{' '}
          <Link href={`/envanter/onay/${pending.id}`}>
            {pending.approver.id === me?.id ? 'İnceleyip onaylayın veya reddedin →' : 'Talebi aç →'}
          </Link>
        </Alert>
      ) : changes.length > 0 ? (
        <p className="small" style={{ margin: 0 }}>
          {lastApproved ? 'Son onaydan bu yana' : 'Henüz onaylanmamış'} <strong>{changes.length} satırda</strong> değişiklik var (
          {(['added', 'updated', 'deleted'] as const)
            .map((k) => [k, changes.filter((c) => c.kind === k).length] as const)
            .filter(([, n]) => n > 0)
            .map(([k, n]) => `${n} ${CHANGE_KINDS[k].label.toLocaleLowerCase('tr-TR')}`)
            .join(', ')}
          ).{canWrite ? ' Değişiklikler envantere hemen yansır; Yönetici onayı kayıt altına alınır.' : ''}
        </p>
      ) : (
        <p className="small" style={{ margin: 0 }}>
          {lastApproved ? 'Envanterin tamamı onaylı.' : 'Envanterde henüz satır yok.'}
        </p>
      )}
      {open && (
        <ApproverDialog
          title="Envanter değişikliklerini onaya gönder"
          permission={PERMISSIONS.INVENTORY_APPROVE}
          hint="Yalnızca envanter onay yetkisi olan üyeler (Yönetici) listelenir."
          busy={busy}
          onClose={() => setOpen(false)}
          onSubmit={send}
        />
      )}
    </div>
  );
}
