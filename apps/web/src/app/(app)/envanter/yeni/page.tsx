'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useState } from 'react';
import { InventoryEntered } from '@/components/inventory-entered';
import { InventoryForm, toPayload } from '@/components/inventory-form';
import { ErrorAlert, Loading, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import type { InventoryEntry, InventoryOptions } from '@/lib/types';
import { useApi } from '@/lib/use-api';

function NewEntryPage() {
  const router = useRouter();
  /** "Kopyala": kaynak satırın bilgileriyle yeni satır formu açılır; kategori yeniden seçilir (aynı kategori tekrar edemez). */
  const sourceId = useSearchParams().get('kaynak');
  const options = useApi<InventoryOptions>('inventory/options');
  const list = useApi<{ items: InventoryEntry[] }>('inventory');
  const source = useApi<InventoryEntry>(sourceId ? `inventory/${sourceId}` : null);
  const [process, setProcess] = useState({ department: '', activity: '' });
  const onProcessChange = useCallback((department: string, activity: string) => setProcess({ department, activity }), []);

  if (options.loading || (list.loading && !list.data) || source.loading) return <Loading />;
  if (!options.data || !list.data) return <ErrorAlert error={options.error ?? list.error} />;
  const initial = source.data
    ? { ...source.data, dataCategory: '', personalData: '', specialCategoryData: '' }
    : undefined;

  return (
    <>
      <p className="small">
        <Link href="/envanter">← Envanter</Link>
      </p>
      <PageHeader
        title="Yeni envanter satırı"
        description={
          source.data
            ? `"${source.data.department} / ${source.data.activity} / ${source.data.dataCategory}" satırının bilgileri kopyalandı. Veri kategorisini seçin; bu süreçte zaten olan kategoriler seçilemez.`
            : 'Adımları sırayla doldurun. Seçenekler listeden seçilir, listede olmayanlar Diğer ile yazılabilir. Seçtiğiniz her veri kategorisi ayrı bir satır olarak kaydedilir.'
        }
      />
      <div className="inv-layout">
        <div className="card">
          <InventoryForm
            options={options.data}
            initial={initial}
            existing={list.data.items}
            onProcessChange={onProcessChange}
            submitLabel="Kaydet"
            onSubmit={async (rows) => {
              // Seçilen her veri kategorisi ayrı bir envanter satırı olur.
              const saved: InventoryEntry[] = [];
              for (const row of rows) {
                try {
                  saved.push(await api<InventoryEntry>('inventory', { method: 'POST', body: toPayload(row) }));
                } catch (err) {
                  if (!saved.length) throw err;
                  await list.reload();
                  const msg = err instanceof Error ? err.message : String(err);
                  throw new Error(
                    `${saved.map((e) => e.dataCategory).join(', ')} kaydedildi; ${row.dataCategory} kaydedilemedi: ${msg}. Kaydedilenler yandaki listede görünür.`,
                  );
                }
              }
              const single = saved.length === 1 ? saved[0] : null;
              router.push(single && !single.complete ? `/envanter/${single.id}?kaydedildi=1` : '/envanter');
            }}
          />
        </div>
        <InventoryEntered entries={list.data.items} department={process.department} activity={process.activity} />
      </div>
    </>
  );
}

export default function NewInventoryEntryPage() {
  return (
    <Suspense>
      <NewEntryPage />
    </Suspense>
  );
}
