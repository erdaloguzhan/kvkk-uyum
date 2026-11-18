'use client';

import { PERMISSIONS } from '@kvkk/shared';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useState } from 'react';
import { InventoryEntered } from '@/components/inventory-entered';
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
  const list = useApi<{ items: InventoryEntry[] }>('inventory');
  const [process, setProcess] = useState<{ department?: string; activity?: string }>({});
  const onProcessChange = useCallback((department: string, activity: string) => setProcess({ department, activity }), []);
  const tasks = useApi<{ items: Task[] }>('tasks', { entityType: 'inventory_entry', entityId: id, status: 'open' });
  const [saved, setSaved] = useState(params.get('kaydedildi') === '1');
  const [added, setAdded] = useState<string[]>([]);
  // Kaydettikten sonra form yeniden kurulur; eklenen kategoriler artık ayrı satır olduğu için bu formda görünmez.
  const [formVersion, setFormVersion] = useState(0);

  if ((entry.loading && !entry.data) || options.loading || (list.loading && !list.data)) return <Loading />;
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
      {saved && (
        <Alert kind="success">
          Kaydedildi.{added.length > 0 && ` Yeni satır olarak eklenen kategoriler: ${added.join(', ')}.`}
        </Alert>
      )}
      {!e.complete && (
        <Alert kind="warning">
          Satırın tamamlanması için eksik alanlar: <strong>{e.missingFields.map(fieldLabel).join(', ')}</strong>
        </Alert>
      )}
      <div className="inv-layout">
        <div className="card">
          <InventoryForm
            key={`${e.id}-${formVersion}`}
            options={options.data}
            initial={e}
            existing={list.data?.items}
            entryId={e.id}
            onProcessChange={onProcessChange}
            readOnly={!canWrite}
            submitLabel="Değişiklikleri kaydet"
            onSubmit={async ([first, ...added]) => {
              const updated = await api<InventoryEntry>(`inventory/${e.id}`, { method: 'PATCH', body: toPayload(first) });
              // Yeni seçilen veri kategorileri, aynı bilgilerle ayrı satırlar olarak eklenir.
              const created: string[] = [];
              try {
                for (const row of added) {
                  await api<InventoryEntry>('inventory', { method: 'POST', body: toPayload(row) });
                  created.push(row.dataCategory);
                }
              } catch (err) {
                // Bu satır kaydedildi; yeni kategorilerden kaydedilemeyen olursa form yeniden kurulmadan hata gösterilir.
                entry.setData(updated);
                await list.reload();
                const msg = err instanceof Error ? err.message : String(err);
                throw new Error(created.length ? `Kaydedildi (yeni satırlar: ${created.join(', ')}); ancak ${msg}` : `Bu satır kaydedildi; ancak ${msg}`);
              }
              entry.setData(updated);
              await list.reload();
              setAdded(created);
              setFormVersion((v) => v + 1);
              setSaved(true);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        </div>
        <InventoryEntered
          entries={list.data?.items ?? []}
          department={process.department ?? e.department}
          activity={process.activity ?? e.activity}
          currentId={e.id}
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
