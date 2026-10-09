'use client';

import { PERMISSIONS } from '@kvkk/shared';
import Link from 'next/link';
import { CompactTaskList } from '@/components/task-list';
import { Badge, Empty, Loading, PageHeader, Stat } from '@/components/ui';
import { useSession } from '@/lib/session';
import type { DocumentItem, InventorySummary, Task, TaskSummary } from '@/lib/types';
import { useApi } from '@/lib/use-api';

export default function DashboardPage() {
  const { me, org, can } = useSession();
  const myTasks = useApi<{ items: Task[] }>('tasks', { mine: true, status: 'open' });
  const taskSummary = useApi<TaskSummary>(can(PERMISSIONS.TASKS_READ) ? 'tasks/summary' : null);
  const docs = useApi<{ items: DocumentItem[] }>(can(PERMISSIONS.DOCUMENTS_READ) ? 'documents' : null);
  const inventory = useApi<InventorySummary>(can(PERMISSIONS.INVENTORY_READ) ? 'inventory/summary' : null);

  if (!org || myTasks.loading) return <Loading />;

  const docItems = docs.data?.items ?? [];
  const published = docItems.filter((d) => d.publishedVersion).length;
  const inv = inventory.data;
  const ts = taskSummary.data;
  const mine = myTasks.data?.items ?? [];

  const steps = [
    {
      done: !!org.setupCompletedAt,
      title: 'Kuruluş bilgilerini tamamlayın',
      text: 'Ünvan, vergi no, adres, iletişim ve yetkili kişi bilgileri dokümanlara yerleşir.',
      href: '/kurulus',
      show: can(PERMISSIONS.ORG_READ),
    },
    {
      done: docItems.length > 0,
      title: 'KVKK dokümanlarını oluşturun',
      text: 'Politika, prosedür, form ve aydınlatma metinleri kuruluş bilgilerinizle hazırlanır.',
      href: '/dokumanlar',
      show: can(PERMISSIONS.DOCUMENTS_WRITE),
    },
    {
      done: docItems.length > 0 && published === docItems.length,
      title: 'Dokümanları gözden geçirip yayınlayın',
      text: docItems.length ? `${published} / ${docItems.length} doküman yayında.` : 'Dokümanlar oluşturulunca yayınlanabilir.',
      href: '/dokumanlar',
      show: can(PERMISSIONS.DOCUMENTS_WRITE),
    },
    {
      done: !!inv && inv.entries > 0 && inv.incomplete === 0,
      title: 'Kişisel veri envanterini doldurun',
      text: inv?.entries
        ? `${inv.entries} satır, ${inv.incomplete} tanesinde eksik bilgi var.`
        : 'Her departmanın hangi kişisel verileri hangi amaçla işlediğini girin veya Excel’den aktarın.',
      href: '/envanter',
      show: can(PERMISSIONS.INVENTORY_WRITE),
    },
  ].filter((s) => s.show);
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <>
      <PageHeader title={`Merhaba, ${me?.fullName.split(' ')[0]}`} description={org.name} />

      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <Stat label="Bana atanan açık görev" value={mine.length} />
        {ts && <Stat label="Süresi geçen görev" value={ts.overdue} tone={ts.overdue ? 'bad' : undefined} />}
        {docs.data && <Stat label="Yayındaki doküman" value={`${published} / ${docItems.length}`} />}
        {inv && <Stat label="Eksik envanter satırı" value={inv.incomplete} tone={inv.incomplete ? 'warn' : undefined} />}
      </div>

      <div className="grid grid-2">
        {steps.length > 0 && (
          <div className="card">
            <div className="card-header">
              <h2>Başlangıç adımları</h2>
              <span className="small muted">
                {doneCount} / {steps.length}
              </span>
            </div>
            <div className="progress" style={{ marginBottom: 12 }}>
              <div style={{ width: `${(doneCount / steps.length) * 100}%` }} />
            </div>
            <ul className="list">
              {steps.map((s) => (
                <li key={s.title} style={{ display: 'flex', gap: 10 }}>
                  <span aria-hidden style={{ fontSize: '1.1rem' }}>
                    {s.done ? '✅' : '⬜'}
                  </span>
                  <div>
                    <Link href={s.href}>{s.title}</Link>
                    <div className="small muted">{s.text}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="card">
          <div className="card-header">
            <h2>Görevlerim</h2>
            <Link href="/gorevler" className="small">
              Tümü →
            </Link>
          </div>
          {mine.length === 0 ? (
            <Empty title="Açık göreviniz yok" />
          ) : (
            <CompactTaskList tasks={mine.slice(0, 6)} />
          )}
          {ts && ts.dueWithin7Days > 0 && (
            <p className="small muted" style={{ marginTop: 10 }}>
              Kuruluşta önümüzdeki 7 gün içinde son tarihi olan <Badge kind="warning">{ts.dueWithin7Days}</Badge> görev var.
            </p>
          )}
        </div>
      </div>

      {inv && inv.departments.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h2>Departmanlara göre envanter</h2>
            <Link href="/envanter" className="small">
              Envantere git →
            </Link>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Departman</th>
                  <th>Satır</th>
                  <th>Eksik</th>
                </tr>
              </thead>
              <tbody>
                {inv.departments.map((d) => (
                  <tr key={d.department}>
                    <td>{d.department}</td>
                    <td>{d.entries}</td>
                    <td>{d.incomplete > 0 ? <Badge kind="warning">{d.incomplete}</Badge> : <Badge kind="success">Tamam</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
