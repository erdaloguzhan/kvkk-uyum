'use client';

import { NOTIFICATION_KINDS } from '@kvkk/shared';
import Link from 'next/link';
import { Badge, Empty, ErrorAlert, Loading, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/labels';
import type { Notification } from '@/lib/types';
import { useApi } from '@/lib/use-api';

/** Eğitmen paneli bildirimleri (kuruluşa bağlı olmayan: Yöneticinin atadığı görevler, hatırlatmalar). */
export default function TrainerNotificationsPage() {
  const list = useApi<{ items: Notification[]; unreadCount: number }>('training-admin/notifications');

  const refresh = async () => {
    await list.reload();
    window.dispatchEvent(new Event('kvkk:notifications'));
  };
  const markRead = async (n: Notification) => {
    if (!n.readAt) {
      await api(`training-admin/notifications/${n.id}/read`, { method: 'POST' }).catch(() => undefined);
      refresh();
    }
  };

  if (list.loading && !list.data) return <Loading />;
  const items = list.data?.items ?? [];

  return (
    <>
      <PageHeader
        title="Bildirimler"
        description="Görev atamaları, yaklaşan ve geçen son tarihler. Aynı bildirimler e-postayla da gönderilir."
        actions={
          (list.data?.unreadCount ?? 0) > 0 && (
            <button
              className="btn"
              onClick={async () => {
                await api('training-admin/notifications/read-all', { method: 'POST' });
                refresh();
              }}
            >
              Tümünü okundu say
            </button>
          )
        }
      />
      <ErrorAlert error={list.error} />
      <div className="card">
        {items.length === 0 ? (
          <Empty title="Bildirim yok" />
        ) : (
          <ul className="list">
            {items.map((n) => (
              <li key={n.id} style={{ opacity: n.readAt ? 0.7 : 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <strong>
                    {!n.readAt && <span aria-label="okunmadı" style={{ color: 'var(--primary)' }}>● </span>}
                    {n.taskId ? (
                      <Link href="/admin/gorevler" onClick={() => markRead(n)}>
                        {n.title}
                      </Link>
                    ) : (
                      n.title
                    )}
                  </strong>
                  <span className="small muted nowrap">{formatDateTime(n.createdAt)}</span>
                </div>
                <div className="small" style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>
                  {n.body}
                </div>
                <div style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Badge
                    kind={
                      n.kind === 'task_overdue' || n.kind === 'incident_deadline'
                        ? 'danger'
                        : n.kind === 'task_due_today' || n.kind === 'incident_recorded'
                          ? 'warning'
                          : 'info'
                    }
                  >
                    {NOTIFICATION_KINDS[n.kind]}
                  </Badge>
                  {!n.readAt && (
                    <button className="btn-link small" onClick={() => markRead(n)}>
                      Okundu say
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
