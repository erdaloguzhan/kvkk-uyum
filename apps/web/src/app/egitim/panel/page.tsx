'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PortalShell } from '@/components/portal-shell';
import { Badge, Empty, ErrorAlert, Loading, PageHeader } from '@/components/ui';
import { errorText } from '@/lib/api';
import { formatDate } from '@/lib/labels';
import { portalApi } from '@/lib/portal-api';
import type { PortalAssignment, PortalDocument } from '@/lib/types';
import { DOCUMENT_CATEGORIES } from '@kvkk/shared';

/** Katılımcıya gönderilmiş eğitimler ve kuruluşunun yayınlanmış KVKK dokümanları. */
export default function PortalHomePage() {
  const [items, setItems] = useState<PortalAssignment[] | null>(null);
  const [docs, setDocs] = useState<PortalDocument[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    portalApi<{ items: PortalAssignment[] }>('assignments').then(
      (r) => setItems(r.items),
      (err) => setError(errorText(err)),
    );
    portalApi<{ items: PortalDocument[] }>('documents').then(
      (r) => setDocs(r.items),
      (err) => setError(errorText(err)),
    );
  }, []);
  const multipleOrgs = new Set(docs?.map((d) => d.organizationId)).size > 1;

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

      <PageHeader title="KVKK dokümanları" description="Kuruluşunuzun onaylanıp yayınlanmış politika, prosedür ve metinleri." />
      {!docs && !error && <Loading />}
      {docs && docs.length === 0 && (
        <div className="card">
          <Empty title="Yayınlanmış doküman yok" />
        </div>
      )}
      {docs && docs.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Kod</th>
                <th>Doküman</th>
                <th>Tür</th>
                {multipleOrgs && <th>Kuruluş</th>}
                <th>Yayın tarihi</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id}>
                  <td>{d.code}</td>
                  <td>{d.title}</td>
                  <td>{DOCUMENT_CATEGORIES[d.category] ?? d.category}</td>
                  {multipleOrgs && <td>{d.organizationName}</td>}
                  <td>{d.publishedAt ? formatDate(d.publishedAt) : '—'}</td>
                  <td>
                    <a className="btn btn-small" href={`/api/portal/documents/${d.id}/file`} download>
                      İndir
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PortalShell>
  );
}
