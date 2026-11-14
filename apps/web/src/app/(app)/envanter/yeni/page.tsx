'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { InventoryForm, toPayload } from '@/components/inventory-form';
import { ErrorAlert, Loading, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import type { InventoryEntry, InventoryOptions } from '@/lib/types';
import { useApi } from '@/lib/use-api';

export default function NewInventoryEntryPage() {
  const router = useRouter();
  const options = useApi<InventoryOptions>('inventory/options');

  if (options.loading) return <Loading />;
  if (!options.data) return <ErrorAlert error={options.error} />;

  return (
    <>
      <p className="small">
        <Link href="/envanter">← Envanter</Link>
      </p>
      <PageHeader title="Yeni envanter satırı" description="Adımları sırayla doldurun. Seçenekler listeden seçilir, listede olmayanlar Diğer ile yazılabilir. Seçtiğiniz her veri kategorisi ayrı bir satır olarak kaydedilir." />
      <div className="card">
        <InventoryForm
          options={options.data}
          submitLabel="Kaydet"
          onSubmit={async (rows) => {
            // Seçilen her veri kategorisi ayrı bir envanter satırı olur.
            const saved: InventoryEntry[] = [];
            for (const row of rows) {
              try {
                saved.push(await api<InventoryEntry>('inventory', { method: 'POST', body: toPayload(row) }));
              } catch (err) {
                if (!saved.length) throw err;
                const msg = err instanceof Error ? err.message : String(err);
                throw new Error(
                  `${saved.map((e) => e.dataCategory).join(', ')} kaydedildi; ${row.dataCategory} kaydedilemedi: ${msg}. Kaydedilenleri tekrar eklememek için envanter listesine bakın.`,
                );
              }
            }
            const single = saved.length === 1 ? saved[0] : null;
            router.push(single && !single.complete ? `/envanter/${single.id}?kaydedildi=1` : '/envanter');
          }}
        />
      </div>
    </>
  );
}
