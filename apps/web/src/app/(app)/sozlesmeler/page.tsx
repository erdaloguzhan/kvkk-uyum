'use client';

import { CONTRACT_STATUSES, CONTRACT_TYPES, ContractStatus, ContractType, PERMISSIONS } from '@kvkk/shared';
import Link from 'next/link';
import { useState } from 'react';
import { contractStatusBadge } from '@/components/contract-status';
import { Empty, ErrorAlert, Loading, PageHeader } from '@/components/ui';
import { formatDay } from '@/lib/labels';
import { useSession } from '@/lib/session';
import type { Contract } from '@/lib/types';
import { useApi } from '@/lib/use-api';

export default function ContractsPage() {
  const { can } = useSession();
  const canManage = can(PERMISSIONS.CONTRACTS_MANAGE);
  const [type, setType] = useState<ContractType | ''>('');
  const [status, setStatus] = useState<ContractStatus | ''>('');
  const [q, setQ] = useState('');
  const list = useApi<{ items: Contract[] }>('contracts', { type, status, q: q.trim() });
  const items = list.data?.items ?? [];
  const filtered = type !== '' || status !== '' || q.trim() !== '';

  return (
    <>
      <PageHeader
        title="Sözleşmeler"
        description="Tedarikçi, müşteri, çalışan ve kamu kurumlarıyla yapılan sözleşmeler."
        actions={
          canManage && (
            <Link className="btn btn-primary" href="/sozlesmeler/yeni">
              + Yeni sözleşme
            </Link>
          )
        }
      />
      <div className="toolbar">
        <input type="search" placeholder="Ad, ünvan veya ilgili kişi ara" aria-label="Ara" value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Sözleşme türü" value={type} onChange={(e) => setType(e.target.value as ContractType | '')}>
          <option value="">Tüm türler</option>
          {(Object.keys(CONTRACT_TYPES) as ContractType[]).map((t) => (
            <option key={t} value={t}>
              {CONTRACT_TYPES[t]}
            </option>
          ))}
        </select>
        <select aria-label="Statü" value={status} onChange={(e) => setStatus(e.target.value as ContractStatus | '')}>
          <option value="">Tüm statüler</option>
          {(Object.keys(CONTRACT_STATUSES) as ContractStatus[]).map((s) => (
            <option key={s} value={s}>
              {CONTRACT_STATUSES[s]}
            </option>
          ))}
        </select>
      </div>
      <ErrorAlert error={list.error} />
      {list.loading && !list.data ? (
        <Loading />
      ) : items.length === 0 ? (
        <div className="card">
          <Empty title={filtered ? 'Aramaya uyan sözleşme yok' : 'Henüz sözleşme eklenmedi'}>
            {!filtered && canManage && (
              <Link className="btn btn-primary" href="/sozlesmeler/yeni">
                + Yeni sözleşme
              </Link>
            )}
          </Empty>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="contracts-table">
            <thead>
              <tr>
                <th>Ad / Ünvan</th>
                <th>Tür</th>
                <th>Başlangıç</th>
                <th>Bitiş</th>
                <th>Statü</th>
                <th>İlgili kişi</th>
                <th>Telefon</th>
                <th>E-posta</th>
                <th>Açıklama</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/sozlesmeler/${c.id}`}>{c.partyName}</Link>
                  </td>
                  <td className="nowrap">{CONTRACT_TYPES[c.type]}</td>
                  <td className="nowrap">{formatDay(c.startDate)}</td>
                  <td className="nowrap">{c.endDate ? formatDay(c.endDate) : <span className="muted">Belirsiz</span>}</td>
                  <td>{contractStatusBadge(c)}</td>
                  <td>{c.contactName ?? '—'}</td>
                  <td className="nowrap">{c.contactPhone ? <a href={`tel:${c.contactPhone}`}>{c.contactPhone}</a> : '—'}</td>
                  <td>{c.contactEmail ? <a href={`mailto:${c.contactEmail}`}>{c.contactEmail}</a> : '—'}</td>
                  <td className="small description">{c.description ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
