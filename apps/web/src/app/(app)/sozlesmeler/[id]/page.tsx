'use client';

import { CONTRACT_TYPES, PERMISSIONS } from '@kvkk/shared';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { ContractForm, toPayload } from '@/components/contract-form';
import { contractStatusBadge } from '@/components/contract-status';
import { Alert, ErrorAlert, Loading, PageHeader } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { formatDateTime } from '@/lib/labels';
import { useSession } from '@/lib/session';
import type { Contract } from '@/lib/types';
import { useApi } from '@/lib/use-api';

export default function ContractPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { can } = useSession();
  const canManage = can(PERMISSIONS.CONTRACTS_MANAGE);
  const contract = useApi<Contract>(`contracts/${id}`);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (contract.loading && !contract.data) return <Loading />;
  if (!contract.data) return <ErrorAlert error={contract.error} />;
  const c = contract.data;

  async function remove() {
    if (!confirm(`"${c.partyName}" sözleşmesi silinsin mi?`)) return;
    try {
      await api(`contracts/${c.id}`, { method: 'DELETE' });
      router.push('/sozlesmeler');
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <>
      <p className="small">
        <Link href="/sozlesmeler">← Sözleşmeler</Link>
      </p>
      <PageHeader
        title={c.partyName}
        description={
          <>
            {CONTRACT_TYPES[c.type]} · Son güncelleme {formatDateTime(c.updatedAt)} {contractStatusBadge(c)}
          </>
        }
        actions={
          canManage && (
            <button className="btn btn-danger" onClick={remove}>
              Sil
            </button>
          )
        }
      />
      {saved && <Alert kind="success">Kaydedildi.</Alert>}
      <ErrorAlert error={error} />
      <div className="card">
        <ContractForm
          key={c.updatedAt}
          initial={c}
          readOnly={!canManage}
          submitLabel="Değişiklikleri kaydet"
          onSubmit={async (values) => {
            const updated = await api<Contract>(`contracts/${c.id}`, { method: 'PATCH', body: toPayload(values) });
            contract.setData(updated);
            setSaved(true);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        />
      </div>
    </>
  );
}
