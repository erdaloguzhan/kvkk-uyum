'use client';

import { PERMISSIONS, TASK_TYPES } from '@kvkk/shared';
import Link from 'next/link';
import { useState } from 'react';
import { dueBadge } from '@/components/task-list';
import { Empty, ErrorAlert, Loading, PageHeader } from '@/components/ui';
import { formatDay } from '@/lib/labels';
import { useSession } from '@/lib/session';
import type { Task } from '@/lib/types';
import { useApi } from '@/lib/use-api';

type TabKey = 'mine' | 'open' | 'overdue' | 'done';

const TABS: { key: TabKey; label: string; query: Record<string, string | boolean>; needsRead?: boolean }[] = [
  { key: 'mine', label: 'Bana atananlar', query: { mine: true, status: 'open' } },
  { key: 'open', label: 'Tüm açık görevler', query: { status: 'open' }, needsRead: true },
  { key: 'overdue', label: 'Süresi geçenler', query: { overdue: true } },
  { key: 'done', label: 'Tamamlananlar', query: { status: 'done' } },
];

export default function TasksPage() {
  const { can } = useSession();
  const [tab, setTab] = useState<TabKey>('mine');
  const tabs = TABS.filter((t) => !t.needsRead || can(PERMISSIONS.TASKS_READ));
  const current = tabs.find((t) => t.key === tab) ?? tabs[0];
  const list = useApi<{ items: Task[] }>('tasks', current.query);
  const items = list.data?.items ?? [];

  return (
    <>
      <PageHeader
        title="Görevler"
        description="Gözden geçirme, periyodik imha ve onay görevleri. Son tarihten önce hatırlatma bildirimi gönderilir."
        actions={
          can(PERMISSIONS.TASKS_MANAGE) && (
            <Link className="btn btn-primary" href="/gorevler/yeni">
              + Yeni görev
            </Link>
          )
        }
      />
      <div className="tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t.key} role="tab" aria-selected={t.key === current.key} className={`tab${t.key === current.key ? ' active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      <ErrorAlert error={list.error} />
      {list.loading && !list.data ? (
        <Loading />
      ) : items.length === 0 ? (
        <div className="card">
          <Empty title="Bu listede görev yok" />
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Görev</th>
                <th>Tür</th>
                <th>Atanan</th>
                <th>Son tarih</th>
                <th>Durum</th>
              </tr>
            </thead>
            <tbody>
              {items.map((t) => (
                <tr key={t.id}>
                  <td>
                    <Link href={`/gorevler/${t.id}`}>{t.title}</Link>
                    {t.recurrenceMonths && <div className="small muted">Tekrarlayan</div>}
                  </td>
                  <td className="small">{TASK_TYPES[t.type]}</td>
                  <td className="small">{t.assignee.fullName}</td>
                  <td className="nowrap">{formatDay(t.dueDate)}</td>
                  <td>{dueBadge(t)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
