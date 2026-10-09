'use client';

import { PERMISSIONS } from '@kvkk/shared';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { InventoryForm, toPayload } from '@/components/inventory-form';
import { CompactTaskList } from '@/components/task-list';
import { Alert, Badge, ErrorAlert, Loading, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { fieldLabel, formatDateTime } from '@/lib/labels';
import { useSession } from '@/lib/session';
import type { InventoryEntry, InventoryOptions, Task } from '@/lib/types';
import { useApi } from '@/lib/use-api';

function EntryPage() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const { can } = useSession();
  const canWrite = can(PERMISSIONS.INVENTORY_WRITE);
  const entry = useApi<InventoryEntry>(`inventory/${id}`);
  const options = useApi<InventoryOptions>('inventory/options');
  const tasks = useApi<{ items: Task[] }>('tasks', { entityType: 'inventory_entry', entityId: id, status: 'open' });
  const [saved, setSaved] = useState(params.get('kaydedildi') === '1');

  if ((entry.loading && !entry.data) || options.loading) return <Loading />;
  if (!entry.data || !options.data) return <ErrorAlert error={entry.error ?? options.error} />;
  const e = entry.data;

  return (
    <>
      <p className="small">
        <Link href="/envanter">← Envanter</Link>
      </p>
      <PageHeader
        title={`${e.department} · ${e.activity}`}
        description={
          <>
            {e.dataCategory} · Son güncelleme {formatDateTime(e.updatedAt)}{' '}
            {e.complete ? <Badge kind="success">Tamam</Badge> : <Badge kind="warning">{e.missingFields.length} eksik</Badge>}
          </>
        }
        actions={
          can(PERMISSIONS.TASKS_MANAGE) && (
            <Link
              className="btn"
              href={`/gorevler/yeni?tur=inventory_review&kayitTuru=inventory_entry&kayit=${e.id}&baslik=${encodeURIComponent(`Envanter gözden geçirme: ${e.department} / ${e.activity}`)}`}
            >
              Gözden geçirme görevi ekle
            </Link>
          )
        }
      />
      {saved && <Alert kind="success">Kaydedildi.</Alert>}
      {!e.complete && (
        <Alert kind="warning">
          Satırın tamamlanması için eksik alanlar: <strong>{e.missingFields.map(fieldLabel).join(', ')}</strong>
        </Alert>
      )}
      <div className="card">
        <InventoryForm
          key={e.id}
          options={options.data}
          initial={e}
          readOnly={!canWrite}
          submitLabel="Değişiklikleri kaydet"
          onSubmit={async (values) => {
            const updated = await api<InventoryEntry>(`inventory/${e.id}`, { method: 'PATCH', body: toPayload(values) });
            entry.setData(updated);
            setSaved(true);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        />
      </div>
      {(tasks.data?.items.length ?? 0) > 0 && (
        <div className="card">
          <h2>Bu satıra bağlı açık görevler</h2>
          <CompactTaskList tasks={tasks.data!.items} />
        </div>
      )}
    </>
  );
}

export default function InventoryEntryPage() {
  return (
    <Suspense>
      <EntryPage />
    </Suspense>
  );
}
