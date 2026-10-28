'use client';

import { PERMISSIONS } from '@kvkk/shared';
import { ChangeEvent, useState } from 'react';
import { useOrgLogo } from '@/components/logo';
import { DOCUMENT_REQUIRED, OrgForm, SETUP_REQUIRED } from '@/components/org-form';
import { Alert, Badge, ErrorAlert, Loading, PageHeader } from '@/components/ui';
import { api, errorText } from '@/lib/api';
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
      {!canManage && <Alert kind="info">Bu bilgileri yalnızca KVKK Sorumlusu değiştirebilir.</Alert>}
      <LogoCard org={org} canManage={canManage} onChange={async (updated) => (setData(updated), await reload())} />
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

/** Firma logosu: kuruluş panellerinin menüsünde gösterilir; yoksa menüde kuruluşun ünvanı yazar. */
function LogoCard({
  org,
  canManage,
  onChange,
}: {
  org: Organization;
  canManage: boolean;
  onChange: (org: Organization) => Promise<unknown>;
}) {
  const url = useOrgLogo(org.logoUpdatedAt);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<Organization>) {
    setBusy(true);
    setError(null);
    try {
      await onChange(await action());
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  function upload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const body = new FormData();
    body.append('file', file);
    run(() => api<Organization>('organizations/current/logo', { method: 'PUT', body }));
  }

  if (!canManage && !url) return null;
  return (
    <div className="card">
      <h2>Firma logosu</h2>
      <p className="small muted">
        Menünün başında gösterilir; logo yoksa kuruluşun ünvanı yazar. PNG veya JPEG, en fazla 1 MB.
      </p>
      <ErrorAlert error={error} />
      {url ? (
        <img src={url} alt="Firma logosu" style={{ maxHeight: 80, maxWidth: 240, display: 'block', marginBottom: 12 }} />
      ) : (
        <p className="small">Logo yüklenmedi.</p>
      )}
      {canManage && (
        <div className="actions">
          <label className="btn btn-small">
            {busy ? 'Yükleniyor…' : url ? 'Logoyu değiştir' : 'Logo yükle'}
            <input type="file" accept="image/png,image/jpeg" hidden disabled={busy} onChange={upload} />
          </label>
          {url && (
            <button
              className="btn btn-small btn-danger"
              disabled={busy}
              onClick={() => run(() => api<Organization>('organizations/current/logo', { method: 'DELETE' }))}
            >
              Logoyu kaldır
            </button>
          )}
        </div>
      )}
    </div>
  );
}
