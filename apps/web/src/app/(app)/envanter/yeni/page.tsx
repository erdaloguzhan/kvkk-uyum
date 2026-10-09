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
      <PageHeader title="Yeni envanter satırı" description="Adımları sırayla doldurun. Öneriler listeden seçilebilir, listede olmayan değer yazılabilir." />
      <div className="card">
        <InventoryForm
          options={options.data}
          submitLabel="Kaydet"
          onSubmit={async (values) => {
            const entry = await api<InventoryEntry>('inventory', { method: 'POST', body: toPayload(values) });
            router.push(entry.complete ? '/envanter' : `/envanter/${entry.id}?kaydedildi=1`);
          }}
        />
      </div>
    </>
  );
}
