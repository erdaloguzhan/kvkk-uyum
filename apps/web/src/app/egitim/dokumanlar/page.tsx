'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PortalShell } from '@/components/portal-shell';
import { Badge, Empty, ErrorAlert, Loading, PageHeader } from '@/components/ui';
import { errorText } from '@/lib/api';
import { formatDate } from '@/lib/labels';
import { portalApi } from '@/lib/portal-api';
import type { PortalDocument } from '@/lib/types';
import { DOCUMENT_CATEGORIES } from '@kvkk/shared';

/** Çalışanın kuruluşunun yayınlanmış KVKK dokümanları; portalda okunur, Word dosyası indirilmez. */
export default function PortalDocumentsPage() {
  const [docs, setDocs] = useState<PortalDocument[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    portalApi<{ items: PortalDocument[] }>('documents').then(
      (r) => setDocs(r.items),
      (err) => setError(errorText(err)),
    );
  }, []);
  const multipleOrgs = new Set(docs?.map((d) => d.organizationId)).size > 1;

  return (
    <PortalShell>
      <PageHeader
        title="KVK Dokümanları"
        description='Kuruluşunuzun onaylanıp yayınlanmış politika, prosedür ve metinleri. Her dokümanı sonuna kadar okuyup "Okudum, anladım." onayı verin.'
      />
      <ErrorAlert error={error} />
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
                <th>Okuma onayı</th>
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
                    {d.confirmedAt ? (
                      <Badge kind="success">Okundu · {formatDate(d.confirmedAt)}</Badge>
                    ) : (
                      <Badge kind="warning">Okunmadı</Badge>
                    )}
                  </td>
                  <td>
                    <Link className={`btn btn-small${d.confirmedAt ? '' : ' btn-primary'}`} href={`/egitim/dokuman/${d.id}`}>
                      Oku
                    </Link>
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
