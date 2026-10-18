'use client';

import { SUPPORT_CATEGORIES, SUPPORT_STATUSES, SupportStatus } from '@kvkk/shared';
import Link from 'next/link';
import { useState } from 'react';
import { responseTime, SupportStatusBadge } from '@/components/support-status';
import { Empty, ErrorAlert, Loading, PageHeader } from '@/components/ui';
import { formatDateTime } from '@/lib/labels';
import type { SupportTicket } from '@/lib/types';
import { useApi } from '@/lib/use-api';

const TABS: { status: SupportStatus | ''; label: string }[] = [
  { status: 'open', label: 'Yanıt bekleyenler' },
  { status: 'answered', label: SUPPORT_STATUSES.answered },
  { status: 'closed', label: SUPPORT_STATUSES.closed },
  { status: '', label: 'Tümü' },
];

export default function AdminSupportPage() {
  const [status, setStatus] = useState<SupportStatus | ''>('open');
  const [assignee, setAssignee] = useState('');
  const [q, setQ] = useState('');
  const list = useApi<{ items: SupportTicket[] }>('admin/support/tickets', { status, assignee, q: q.trim() });
  const items = list.data?.items ?? [];

  return (
    <>
      <PageHeader
        title="Destek talepleri"
        description="Kuruluşların açtığı destek talepleri. Yanıt yazdığınızda kullanıcıya e-posta gider; sorumlusu olmayan talebi yanıtlayan kişi sorumlu olur."
      />
      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.label} type="button" className={`tab${status === t.status ? ' active' : ''}`} onClick={() => setStatus(t.status)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="toolbar">
        <input type="search" placeholder="No, konu, kuruluş veya kişi ara" aria-label="Ara" value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Sorumlu" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
          <option value="">Tüm sorumlular</option>
          <option value="me">Bana atananlar</option>
          <option value="none">Atanmamış</option>
        </select>
      </div>
      <ErrorAlert error={list.error} />
      {list.loading && !list.data ? (
        <Loading />
      ) : items.length === 0 ? (
        <div className="card">
          <Empty title="Bu görünümde talep yok" />
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>No</th>
                <th>Konu</th>
                <th>Kuruluş</th>
                <th>Açan</th>
                <th>Kategori</th>
                <th>Durum</th>
                <th>Sorumlu</th>
                <th>Son hareket</th>
                <th>İlk yanıt süresi</th>
              </tr>
            </thead>
            <tbody>
              {items.map((t) => (
                <tr key={t.id}>
                  <td className="nowrap">#{t.number}</td>
                  <td>
                    <Link href={`/admin/destek/${t.id}`}>{t.subject}</Link>
                  </td>
                  <td>{t.organizationName}</td>
                  <td>{t.createdByName ?? '—'}</td>
                  <td>{SUPPORT_CATEGORIES[t.category]}</td>
                  <td>
                    <SupportStatusBadge status={t.status} />
                  </td>
                  <td>{t.assigneeName ?? <span className="muted">Atanmamış</span>}</td>
                  <td className="nowrap">{formatDateTime(t.lastMessageAt)}</td>
                  <td className="nowrap">{responseTime(t.createdAt, t.firstResponseAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
