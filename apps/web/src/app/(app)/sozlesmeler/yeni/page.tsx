'use client';

import { PERMISSIONS } from '@kvkk/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ContractForm, toPayload } from '@/components/contract-form';
import { Alert, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import type { Contract } from '@/lib/types';

export default function NewContractPage() {
  const router = useRouter();
  const { can } = useSession();

  return (
    <>
      <p className="small">
        <Link href="/sozlesmeler">← Sözleşmeler</Link>
      </p>
      <PageHeader title="Yeni sözleşme" />
      {can(PERMISSIONS.CONTRACTS_MANAGE) ? (
        <div className="card">
          <ContractForm
            submitLabel="Kaydet"
            onSubmit={async (values) => {
              await api<Contract>('contracts', { method: 'POST', body: toPayload(values) });
              router.push('/sozlesmeler');
            }}
          />
        </div>
      ) : (
        <Alert kind="info">Sözleşme ekleme yetkiniz yok.</Alert>
      )}
    </>
  );
}
