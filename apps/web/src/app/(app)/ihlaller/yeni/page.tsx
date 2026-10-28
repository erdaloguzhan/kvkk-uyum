'use client';

import { IncidentForm, PERMISSIONS } from '@kvkk/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { IncidentFormFields, incidentValues, toIncidentPayload } from '@/components/incident-form';
import { Alert, ErrorAlert, Loading, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import type { Incident } from '@/lib/types';
import { useApi } from '@/lib/use-api';

export default function NewIncidentPage() {
  const router = useRouter();
  const { can } = useSession();
  const canManage = can(PERMISSIONS.INCIDENTS_MANAGE);
  const defaults = useApi<Partial<IncidentForm>>(canManage ? 'incidents/form-defaults' : null);

  return (
    <>
      <p className="small">
        <Link href="/ihlaller">← Veri ihlalleri</Link>
      </p>
      <PageHeader
        title="Yeni veri ihlali kaydı"
        description="FRM-020 KVK Veri İhlal Kayıt ve Bildirim Formu. Bildiklerinizi şimdi kaydedin; eksikleri sonra tamamlayabilirsiniz."
      />
      {!canManage ? (
        <Alert kind="info">Veri ihlali kaydı açma yetkiniz yok.</Alert>
      ) : defaults.loading && !defaults.data ? (
        <Loading />
      ) : (
        <>
          <ErrorAlert error={defaults.error} />
          <Alert kind="warning">
            PRS-030 gereği olası ihlaller tespitten itibaren 72 saat içinde KVK Kuruluna bildirilmelidir. Kayıt açıldığında Yöneticiye
            bildirim gider; süre dolmadan 24 saat kala ve süre geçince yeniden uyarılırsınız.
          </Alert>
          <IncidentFormFields
            initial={incidentValues(undefined, defaults.data)}
            notificationType="initial"
            submitLabel="Kaydet"
            onSubmit={async (values) => {
              const created = await api<Incident>('incidents', { method: 'POST', body: toIncidentPayload(values) });
              router.push(`/ihlaller/${created.id}`);
            }}
          />
        </>
      )}
    </>
  );
}
