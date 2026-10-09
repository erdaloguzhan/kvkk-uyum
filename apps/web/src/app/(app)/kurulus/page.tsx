'use client';

import { PERMISSIONS } from '@kvkk/shared';
import { useState } from 'react';
import { DOCUMENT_REQUIRED, OrgForm, SETUP_REQUIRED } from '@/components/org-form';
import { Alert, Badge, ErrorAlert, Loading, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { formatDate, ORG_FIELD_LABELS } from '@/lib/labels';
import { useSession } from '@/lib/session';
import type { Organization } from '@/lib/types';
import { useApi } from '@/lib/use-api';

const LICENSE: Record<string, string> = { trial: 'Deneme', active: 'Aktif', expired: 'Süresi doldu' };

export default function OrganizationPage() {
  const { can, reload } = useSession();
  const { data: org, error, loading, setData } = useApi<Organization>('organizations/current');
  const [saved, setSaved] = useState(false);
  const canManage = can(PERMISSIONS.ORG_MANAGE);

  if (loading && !org) return <Loading />;
  if (!org) return <ErrorAlert error={error} />;

  const missing = DOCUMENT_REQUIRED.filter((k) => !org[k]);

  return (
    <>
      <PageHeader
        title="Kuruluş bilgileri"
        description="Ünvan, adres ve iletişim bilgileri doküman şablonlarına otomatik yerleşir."
        actions={
          <>
            <Badge kind={org.licenseStatus === 'expired' ? 'danger' : org.licenseStatus === 'trial' ? 'warning' : 'success'}>
              Lisans: {LICENSE[org.licenseStatus] ?? org.licenseStatus}
            </Badge>
            {org.licenseExpiresAt && <span className="small muted">Bitiş: {formatDate(org.licenseExpiresAt)}</span>}
          </>
        }
      />
      {saved && (
        <Alert kind="success">
          Bilgiler kaydedildi. Mevcut dokümanların yeni bilgilerle güncellenmesi için Dokümanlar sayfasında &quot;Bilgilerle yeniden
          oluştur&quot; diyebilirsiniz.
        </Alert>
      )}
      {missing.length > 0 && (
        <Alert kind="warning">
          Kurulumu tamamlamak ve dokümanları oluşturmak için şu bilgiler gerekli:{' '}
          <strong>{missing.map((k) => ORG_FIELD_LABELS[k]).join(', ')}</strong>
        </Alert>
      )}
      {!canManage && <Alert kind="info">Bu bilgileri yalnızca Kuruluş Yöneticisi değiştirebilir.</Alert>}
      <div className="card">
        <OrgForm
          key={org.id}
          initial={org}
          readOnly={!canManage}
          submitLabel="Kaydet"
          onSubmit={async (profile) => {
            setSaved(false);
            let updated = await api<Organization>('organizations/current', { method: 'PATCH', body: profile });
            if (!updated.setupCompletedAt && SETUP_REQUIRED.every((k) => updated[k])) {
              updated = await api<Organization>('organizations/current/complete-setup', { method: 'POST' });
            }
            // Menüdeki kuruluş adı ve kurulum durumu için.
            await reload();
            setData(updated);
            setSaved(true);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        />
      </div>
    </>
  );
}
