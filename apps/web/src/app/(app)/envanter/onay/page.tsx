'use client';

import Link from 'next/link';
import { approvalBadge } from '@/components/inventory-approval';
import { Empty, ErrorAlert, Loading, PageHeader } from '@/components/ui';
import { formatDateTime } from '@/lib/labels';
import type { InventoryApprovalListItem } from '@/lib/types';
import { useApi } from '@/lib/use-api';

/** Veri envanteri onay talepleri (geçmiş). */
export default function InventoryApprovalsPage() {
  const list = useApi<{ items: InventoryApprovalListItem[] }>('inventory/approval-requests');
  const items = list.data?.items ?? [];
  return (
    <>
      <p className="small">
        <Link href="/envanter">← Veri envanteri</Link>
      </p>
      <PageHeader title="Envanter onay geçmişi" description="Envanter değişikliklerinin Yöneticiye gönderildiği talepler ve kararları." />
      <ErrorAlert error={list.error} />
      {list.loading && !list.data ? (
        <Loading />
      ) : items.length === 0 ? (
        <div className="card">
          <Empty title="Henüz onay talebi yok" />
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Gönderilme</th>
                <th>Gönderen</th>
                <th>Onaylayacak</th>
                <th>Değişen satır</th>
                <th>Durum</th>
                <th>Karar</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id}>
                  <td className="nowrap">
                    <Link href={`/envanter/onay/${r.id}`}>{formatDateTime(r.createdAt)}</Link>
                  </td>
                  <td>{r.requestedBy?.fullName ?? '—'}</td>
                  <td>{r.approver.fullName}</td>
                  <td>{r.changeCount}</td>
                  <td>{approvalBadge(r.status)}</td>
                  <td className="small">
                    {r.decidedAt ? formatDateTime(r.decidedAt) : '—'}
                    {r.decisionNote && <div className="muted">{r.decisionNote}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
