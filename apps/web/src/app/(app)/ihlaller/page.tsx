'use client';

import { INCIDENT_NOTIFICATION_TYPES, INCIDENT_STATUSES, IncidentStatus, PERMISSIONS } from '@kvkk/shared';
import Link from 'next/link';
import { useState } from 'react';
import { ExportButton } from '@/components/export-button';
import { deadlineBadge, incidentStatusBadge } from '@/components/incident-status';
import { Empty, ErrorAlert, Loading, PageHeader } from '@/components/ui';
import { INCIDENT_EXPORT_COLUMNS } from '@/lib/incident-export';
import { formatDateTime } from '@/lib/labels';
import { useSession } from '@/lib/session';
import type { Incident } from '@/lib/types';
import { useApi } from '@/lib/use-api';


export default function IncidentsPage() {
  const { can } = useSession();
  const canManage = can(PERMISSIONS.INCIDENTS_MANAGE);
  const [status, setStatus] = useState<IncidentStatus | ''>('');
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const list = useApi<{ items: Incident[] }>('incidents', { status, q: q.trim(), from, to });
  const items = list.data?.items ?? [];
  const filtered = status !== '' || q.trim() !== '' || from !== '' || to !== '';
  const urgent = items.filter((i) => i.overdue || (i.hoursLeft !== null && i.hoursLeft <= 24));

  return (
    <>
      <PageHeader
        title="Veri ihlalleri"
        description="PRS-030 Veri İhlal Olay Yönetimi: olay kayıtları, 72 saatlik Kurula bildirim takibi ve FRM-020 bildirim formları."
        actions={
          <>
            <Link className="btn" href="/ihlaller/rapor">
              Rapor
            </Link>
            <ExportButton fileName="Veri ihlali kayıtları" columns={INCIDENT_EXPORT_COLUMNS} rows={items} />
            {canManage && (
              <Link className="btn btn-primary" href="/ihlaller/yeni">
                + Yeni olay kaydı
              </Link>
            )}
          </>
        }
      />
      {urgent.length > 0 && (
        <div className="alert alert-error">
          {urgent.length} olay için Kurula bildirim süresi doldu veya 24 saatten az kaldı.
        </div>
      )}
      <div className="toolbar">
        <input type="search" placeholder="Başlık, açıklama veya no ara" aria-label="Ara" value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Durum" value={status} onChange={(e) => setStatus(e.target.value as IncidentStatus | '')}>
          <option value="">Tüm durumlar</option>
          {(Object.keys(INCIDENT_STATUSES) as IncidentStatus[]).map((s) => (
            <option key={s} value={s}>
              {INCIDENT_STATUSES[s]}
            </option>
          ))}
        </select>
        <label className="small">
          Tespit{' '}
          <input type="date" aria-label="Başlangıç" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 'auto' }} />
        </label>
        <label className="small">
          –{' '}
          <input type="date" aria-label="Bitiş" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} style={{ width: 'auto' }} />
        </label>
      </div>
      <ErrorAlert error={list.error} />
      {list.loading && !list.data ? (
        <Loading />
      ) : items.length === 0 ? (
        <div className="card">
          <Empty title={filtered ? 'Aramaya uyan kayıt yok' : 'Henüz veri ihlali kaydı yok'}>
            {!filtered && canManage && (
              <Link className="btn btn-primary" href="/ihlaller/yeni">
                + Yeni olay kaydı
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
                <th>Olay</th>
                <th>Tespit</th>
                <th>Durum</th>
                <th>72 saat</th>
                <th>Kurula bildirim</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id}>
                  <td className="nowrap">#{i.number}</td>
                  <td>
                    <Link href={`/ihlaller/${i.id}`}>{i.title}</Link>
                    <div className="small muted">{INCIDENT_NOTIFICATION_TYPES[i.notificationType]}</div>
                  </td>
                  <td className="nowrap">{formatDateTime(i.detectedAt)}</td>
                  <td>{incidentStatusBadge(i.status)}</td>
                  <td>{deadlineBadge(i)}</td>
                  <td className="nowrap">{formatDateTime(i.notifiedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
