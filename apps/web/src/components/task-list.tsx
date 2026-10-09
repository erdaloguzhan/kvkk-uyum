'use client';

import { TASK_TYPES } from '@kvkk/shared';
import Link from 'next/link';
import { daysLeftText, formatDay } from '@/lib/labels';
import type { Task } from '@/lib/types';
import { Badge } from './ui';

export function dueBadge(t: Task) {
  if (t.status === 'done') return <Badge kind="success">Tamamlandı</Badge>;
  if (t.status === 'cancelled') return <Badge>İptal edildi</Badge>;
  const kind = t.overdue ? 'danger' : t.daysLeft !== null && t.daysLeft <= 7 ? 'warning' : 'info';
  return <Badge kind={kind}>{daysLeftText(t.daysLeft, t.overdue)}</Badge>;
}

/** Göreve bağlı kaydın sayfası (doküman veya envanter satırı). */
export function entityHref(t: Pick<Task, 'entityType' | 'entityId'>): string | null {
  if (!t.entityId) return null;
  if (t.entityType === 'document') return `/dokumanlar/${t.entityId}`;
  if (t.entityType === 'inventory_entry') return `/envanter/${t.entityId}`;
  return null;
}

export function CompactTaskList({ tasks }: { tasks: Task[] }) {
  return (
    <ul className="list">
      {tasks.map((t) => (
        <li key={t.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
          <div>
            <Link href={`/gorevler/${t.id}`}>{t.title}</Link>
            <div className="small muted">
              {TASK_TYPES[t.type]} · Son tarih {formatDay(t.dueDate)}
            </div>
          </div>
          {dueBadge(t)}
        </li>
      ))}
    </ul>
  );
}
