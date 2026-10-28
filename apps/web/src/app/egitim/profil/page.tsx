'use client';

import { useEffect, useState } from 'react';
import { PortalShell } from '@/components/portal-shell';
import { ErrorAlert, Loading, PageHeader } from '@/components/ui';
import { errorText } from '@/lib/api';
import { portalApi } from '@/lib/portal-api';
import type { PortalProfile } from '@/lib/types';

/** Çalışanın kendi bilgileri. Bilgiler kuruluşun çalışan kaydından gelir; değişiklik için kuruluşa başvurulur. */
export default function PortalProfilePage() {
  const [profile, setProfile] = useState<PortalProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    portalApi<PortalProfile>('me').then(setProfile, (err) => setError(errorText(err)));
  }, []);

  return (
    <PortalShell>
      <PageHeader title="Profilim" description="Bilgileriniz çalıştığınız kuruluşun kayıtlarından gelir. Değişiklik için kuruluşunuza başvurun." />
      <ErrorAlert error={error} />
      {!profile && !error && <Loading />}
      {profile && (
        <div className="card">
          <dl className="details">
            <dt>Ad soyad</dt>
            <dd>{profile.fullName ?? '—'}</dd>
            <dt>Cep telefonu</dt>
            <dd>{profile.phone}</dd>
            <dt>E-posta</dt>
            <dd>{profile.email ?? '—'}</dd>
            <dt>Kuruluş</dt>
            <dd>{profile.organizations.join(', ') || '—'}</dd>
          </dl>
        </div>
      )}
    </PortalShell>
  );
}
