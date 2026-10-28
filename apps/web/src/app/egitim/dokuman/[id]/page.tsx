'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { PortalShell } from '@/components/portal-shell';
import { SafeHtml } from '@/components/safe-html';
import { Alert, Badge, ErrorAlert, Loading, PageHeader } from '@/components/ui';
import { errorText } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/labels';
import { portalApi } from '@/lib/portal-api';
import type { PortalDocumentView } from '@/lib/types';

/** Çalışanın yayınlanmış dokümanı okuduğu sayfa; sonunda "Okudum, anladım." onayı verilir. */
export default function PortalDocumentPage() {
  const { id } = useParams<{ id: string }>();
  const [doc, setDoc] = useState<PortalDocumentView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  // Onay kutusu, dokümanın sonu ekranda göründükten sonra açılır.
  const [reachedEnd, setReachedEnd] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const load = () =>
    portalApi<PortalDocumentView>(`documents/${id}`).then(
      (d) => {
        setDoc(d);
        setChecked(false);
      },
      (err) => setError(errorText(err)),
    );
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    const el = endRef.current;
    if (!el || reachedEnd) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setReachedEnd(true);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [doc, reachedEnd]);

  async function confirmRead() {
    if (!doc) return;
    setBusy(true);
    setError(null);
    try {
      const r = await portalApi<{ confirmedAt: string }>(`documents/${doc.id}/read`, {
        method: 'POST',
        body: { versionId: doc.versionId },
      });
      setDoc({ ...doc, confirmedAt: r.confirmedAt });
    } catch (err) {
      setError(errorText(err));
      // Doküman bu arada güncellendiyse yeni sürüm yüklenir.
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <PortalShell>
      <p className="small">
        <Link href="/egitim/dokumanlar">← KVK Dokümanları</Link>
      </p>
      {!doc && !error && <Loading />}
      <ErrorAlert error={error} />
      {doc && (
        <>
          <PageHeader
            title={`${doc.code} ${doc.title}`}
            description={`${doc.organizationName} · Sürüm ${doc.versionNo}${doc.publishedAt ? ` · Yayın: ${formatDate(doc.publishedAt)}` : ''}`}
          />
          <div className="card">
            <SafeHtml html={doc.html} className="markdown document-body" />
            <div ref={endRef} />
          </div>
          <div className="card">
            {doc.confirmedAt ? (
              <Alert kind="success">
                Bu dokümanı (sürüm {doc.versionNo}) {formatDateTime(doc.confirmedAt)} tarihinde okuyup anladığınızı onayladınız.
              </Alert>
            ) : (
              <>
                {!reachedEnd && <p className="small muted">Onay vermek için dokümanı sonuna kadar okuyun.</p>}
                <label className="checkbox" style={{ marginBottom: 12 }}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!reachedEnd}
                    onChange={(e) => setChecked(e.target.checked)}
                  />{' '}
                  Okudum, anladım.
                </label>
                <div className="actions">
                  <button className="btn btn-primary" onClick={confirmRead} disabled={!checked || busy}>
                    {busy ? 'Kaydediliyor…' : 'Onayla'}
                  </button>
                  <Badge kind="warning">Onay bekleniyor</Badge>
                </div>
                <p className="small muted" style={{ marginBottom: 0 }}>
                  Onayınız, okuduğunuz sürümle birlikte kuruluşunuzun kayıtlarına geçer.
                </p>
              </>
            )}
          </div>
        </>
      )}
    </PortalShell>
  );
}
