'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PortalShell } from '@/components/portal-shell';
import { ErrorAlert, Loading, PageHeader, Stat } from '@/components/ui';
import { errorText } from '@/lib/api';
import { portalApi } from '@/lib/portal-api';
import type { PortalAssignment, PortalDocument, PortalProfile } from '@/lib/types';

/** Çalışan paneli özeti: bekleyen eğitimler ve okuma onayı bekleyen dokümanlar. */
export default function PortalHomePage() {
  const [profile, setProfile] = useState<PortalProfile | null>(null);
  const [items, setItems] = useState<PortalAssignment[] | null>(null);
  const [docs, setDocs] = useState<PortalDocument[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fail = (err: unknown) => setError(errorText(err));
    portalApi<PortalProfile>('me').then(setProfile, fail);
    portalApi<{ items: PortalAssignment[] }>('assignments').then((r) => setItems(r.items), fail);
    portalApi<{ items: PortalDocument[] }>('documents').then((r) => setDocs(r.items), fail);
  }, []);

  const pendingTrainings = items?.filter((a) => !a.completedAt).length ?? 0;
  const unreadDocs = docs?.filter((d) => !d.confirmedAt).length ?? 0;

  return (
    <PortalShell>
      <PageHeader
        title={profile?.fullName ? `Merhaba, ${profile.fullName.split(' ')[0]}` : 'Özet'}
        description={profile?.organizations.join(', ')}
      />
      <ErrorAlert error={error} />
      {(!items || !docs) && !error ? (
        <Loading />
      ) : (
        <>
          <div className="grid grid-4" style={{ marginBottom: 16 }}>
            {items && <Stat label="Tamamlanmamış eğitim" value={pendingTrainings} tone={pendingTrainings ? 'warn' : undefined} />}
            {docs && <Stat label="Okuma onayı bekleyen doküman" value={unreadDocs} tone={unreadDocs ? 'warn' : undefined} />}
          </div>
          <div className="card">
            {pendingTrainings === 0 && unreadDocs === 0 ? (
              <p style={{ margin: 0 }}>Bekleyen eğitiminiz veya okumanız gereken dokümanınız yok.</p>
            ) : (
              <ul style={{ margin: 0 }}>
                {pendingTrainings > 0 && (
                  <li>
                    <Link href="/egitim/egitimlerim">Eğitimlerim</Link> sayfasından {pendingTrainings} eğitimi tamamlayın.
                  </li>
                )}
                {unreadDocs > 0 && (
                  <li>
                    <Link href="/egitim/dokumanlar">KVK Dokümanları</Link> sayfasından {unreadDocs} dokümanı okuyup onaylayın.
                  </li>
                )}
              </ul>
            )}
          </div>
        </>
      )}
    </PortalShell>
  );
}
