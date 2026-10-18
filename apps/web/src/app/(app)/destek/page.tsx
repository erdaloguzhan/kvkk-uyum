'use client';

import { PERMISSIONS, SUPPORT_CATEGORIES, SUPPORT_STATUSES, SupportStatus } from '@kvkk/shared';
import Link from 'next/link';
import { useState } from 'react';
import { SupportStatusBadge } from '@/components/support-status';
import { Empty, ErrorAlert, Loading, PageHeader } from '@/components/ui';
import { formatDateTime } from '@/lib/labels';
import { useSession } from '@/lib/session';
import type { SupportTicket } from '@/lib/types';
import { useApi } from '@/lib/use-api';

export default function SupportPage() {
  const { can } = useSession();
  const seesAll = can(PERMISSIONS.ORG_MANAGE);
  const [status, setStatus] = useState<SupportStatus | ''>('');
  const list = useApi<{ items: SupportTicket[] }>('support/tickets', { status });
  const items = list.data?.items ?? [];

  return (
    <>
      <PageHeader
        title="Destek"
        description={
          seesAll
            ? 'Kuruluşunuzun destek talepleri. Sorunuzu yazın, destek ekibimiz yanıtladığında e-postayla haber verelim.'
            : 'Destek talepleriniz. Sorunuzu yazın, destek ekibimiz yanıtladığında e-postayla haber verelim.'
        }
        actions={
          <Link className="btn btn-primary" href="/destek/yeni">
            + Yeni talep
          </Link>
        }
      />
      <div className="toolbar">
        <select aria-label="Durum" value={status} onChange={(e) => setStatus(e.target.value as SupportStatus | '')}>
          <option value="">Tüm talepler</option>
          {(Object.keys(SUPPORT_STATUSES) as SupportStatus[]).map((s) => (
            <option key={s} value={s}>
              {SUPPORT_STATUSES[s]}
            </option>
          ))}
        </select>
      </div>
      <ErrorAlert error={list.error} />
      {list.loading && !list.data ? (
        <Loading />
      ) : items.length === 0 ? (
        <div className="card">
          <Empty title={status ? 'Bu durumda talep yok' : 'Henüz destek talebi açılmadı'}>
            {!status && (
              <Link className="btn btn-primary" href="/destek/yeni">
                + Yeni talep
              </Link>
            )}
          </Empty>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>No</th>
                <th>Konu</th>
                <th>Kategori</th>
                {seesAll && <th>Açan</th>}
                <th>Durum</th>
                <th>Son hareket</th>
              </tr>
            </thead>
            <tbody>
              {items.map((t) => (
                <tr key={t.id}>
                  <td className="nowrap">#{t.number}</td>
                  <td>
                    <Link href={`/destek/${t.id}`}>{t.subject}</Link>
                  </td>
                  <td>{SUPPORT_CATEGORIES[t.category]}</td>
                  {seesAll && <td>{t.createdByName ?? '—'}</td>}
                  <td>
                    <SupportStatusBadge status={t.status} />
                  </td>
                  <td className="nowrap">{formatDateTime(t.lastMessageAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
