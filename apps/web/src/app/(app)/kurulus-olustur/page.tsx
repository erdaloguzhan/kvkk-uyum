'use client';

import { useRouter } from 'next/navigation';
import { OrgForm, SETUP_REQUIRED } from '@/components/org-form';
import { Alert, PageHeader } from '@/components/ui';
import { api, setCurrentOrgId } from '@/lib/api';
import { useSession } from '@/lib/session';
import type { Organization } from '@/lib/types';

export default function CreateOrganizationPage() {
  const router = useRouter();
  const { me, reload, selectOrg } = useSession();
  const first = me?.organizations.length === 0;

  return (
    <>
      <PageHeader
        title={first ? 'Kuruluşunuzu ekleyin' : 'Yeni kuruluş'}
        description="Bu bilgiler KVKK dokümanlarına otomatik olarak yerleşir. Sonradan değiştirebilirsiniz."
      />
      {first && (
        <Alert kind="info">
          Hoş geldiniz. Başlamak için kuruluşunuzun bilgilerini girin. Danışmansanız birden çok kuruluş ekleyip aralarında
          geçiş yapabilirsiniz.
        </Alert>
      )}
      <div className="card">
        <OrgForm
          submitLabel="Kuruluşu oluştur"
          onSubmit={async (profile) => {
            const org = await api<Organization>('organizations', { method: 'POST', body: profile });
            setCurrentOrgId(org.id);
            if (SETUP_REQUIRED.every((k) => profile[k])) {
              await api('organizations/current/complete-setup', { method: 'POST' });
            }
            selectOrg(org.id);
            await reload();
            router.push('/');
          }}
        />
      </div>
    </>
  );
}
