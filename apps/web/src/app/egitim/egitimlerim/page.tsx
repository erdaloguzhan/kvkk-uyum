'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PortalShell } from '@/components/portal-shell';
import { Badge, Empty, ErrorAlert, Loading, PageHeader } from '@/components/ui';
import { errorText } from '@/lib/api';
import { formatDate } from '@/lib/labels';
import { portalApi } from '@/lib/portal-api';
import type { PortalAssignment } from '@/lib/types';

/** Çalışana gönderilmiş eğitimler. */
export default function PortalTrainingsPage() {
  const [items, setItems] = useState<PortalAssignment[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    portalApi<{ items: PortalAssignment[] }>('assignments').then(
      (r) => setItems(r.items),
      (err) => setError(errorText(err)),
    );
  }, []);

  return (
    <PortalShell>
      <PageHeader title="Eğitimlerim" />
      <ErrorAlert error={error} />
      {!items && !error && <Loading />}
      {items && items.length === 0 && (
        <div className="card">
          <Empty title="Size atanmış eğitim yok" />
        </div>
      )}
      {items?.map((a) => (
        <div className="card" key={a.id}>
          <div className="card-header">
            <div>
              <h2>{a.trainingName}</h2>
              <div className="muted small">
                {a.organizationName} · {formatDate(a.sentAt)} tarihinde gönderildi
              </div>
            </div>
            {a.completedAt ? (
              <Badge kind="success">Tamamlandı · {formatDate(a.completedAt)}</Badge>
            ) : (
              <Link className="btn btn-primary" href={`/egitim/ders/${a.id}`}>
                {a.startedAt ? 'Eğitime devam et' : 'Eğitime başla'}
              </Link>
            )}
          </div>
          {!a.completedAt && (
            <p className="muted small" style={{ margin: 0 }}>
              Eğitim bir ön test, ders konuları ve bir son testten oluşur. Her konu belirli bir süre okunmadan sonrakine
              geçilemez. Eğitimi bitirmeden çıkarsanız tekrar girdiğinizde konular baştan başlar.
            </p>
          )}
        </div>
      ))}

    </PortalShell>
  );
}
