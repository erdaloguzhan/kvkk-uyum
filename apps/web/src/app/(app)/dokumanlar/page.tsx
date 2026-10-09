'use client';

import { DOCUMENT_CATEGORIES, PERMISSIONS } from '@kvkk/shared';
import Link from 'next/link';
import { useState } from 'react';
import { documentStatus } from '@/components/document-status';
import { Alert, Empty, ErrorAlert, Loading, PageHeader } from '@/components/ui';
import { api, ApiError, errorText } from '@/lib/api';
import { formatDate } from '@/lib/labels';
import { useSession } from '@/lib/session';
import type { DocumentItem, TemplateItem } from '@/lib/types';
import { useApi } from '@/lib/use-api';

export default function DocumentsPage() {
  const { can } = useSession();
  const canWrite = can(PERMISSIONS.DOCUMENTS_WRITE);
  const docs = useApi<{ items: DocumentItem[] }>('documents');
  const templates = useApi<{ items: TemplateItem[] }>('document-templates');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ text: string; missingProfile: boolean } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (docs.loading && !docs.data) return <Loading />;

  const items = docs.data?.items ?? [];
  const tpl = templates.data?.items ?? [];
  const pendingRequired = tpl.filter((t) => !t.optional && !t.documentId);
  const optional = tpl.filter((t) => t.optional && !t.documentId);

  async function run(key: string, fn: () => Promise<string>) {
    setBusy(key);
    setError(null);
    setMessage(null);
    try {
      setMessage(await fn());
      await Promise.all([docs.reload(), templates.reload()]);
    } catch (err) {
      setError({ text: errorText(err), missingProfile: err instanceof ApiError && !!err.body.missing?.length });
    } finally {
      setBusy(null);
    }
  }

  const setup = () =>
    run('setup', async () => {
      const r = await api<{ created: unknown[] }>('documents/setup', { method: 'POST' });
      return `${r.created.length} doküman taslak olarak oluşturuldu. Gözden geçirip yayınlayabilirsiniz.`;
    });
  const addOptional = (t: TemplateItem) =>
    run(t.code, async () => {
      await api('documents', { method: 'POST', body: { templateCode: t.code } });
      return `${t.code} ${t.title} oluşturuldu.`;
    });

  const byCategory = Object.entries(DOCUMENT_CATEGORIES)
    .map(([key, label]) => ({ key, label, docs: items.filter((d) => d.category === key) }))
    .filter((g) => g.docs.length > 0);

  return (
    <>
      <PageHeader
        title="Dokümanlar"
        description="KVKK politika, prosedür, form ve aydınlatma metinleri. Şablonlar kuruluş bilgilerinizle doldurulur."
      />
      <ErrorAlert error={docs.error} />
      {error && (
        <Alert kind="error">
          {error.text}
          {error.missingProfile && (
            <>
              {' '}
              <Link href="/kurulus">Kuruluş bilgilerini tamamlayın →</Link>
            </>
          )}
        </Alert>
      )}
      {message && <Alert kind="success">{message}</Alert>}

      {canWrite && pendingRequired.length > 0 && (
        <div className="card">
          <div className="card-header">
            <div>
              <h2>{items.length === 0 ? 'Dokümanlarınızı oluşturun' : 'Eksik dokümanlar'}</h2>
              <p className="muted small" style={{ margin: '4px 0 0' }}>
                {pendingRequired.length} zorunlu şablondan doküman henüz oluşturulmadı:{' '}
                {pendingRequired.map((t) => t.code).join(', ')}
              </p>
            </div>
            <button className="btn btn-primary" onClick={setup} disabled={busy !== null}>
              {busy === 'setup' ? 'Oluşturuluyor…' : 'Hepsini oluştur'}
            </button>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <div className="card">
          <Empty title="Henüz doküman yok">
            {canWrite ? 'Yukarıdaki düğmeyle şablonlardan dokümanlarınızı oluşturun.' : 'Yayınlanmış doküman olduğunda burada görünecek.'}
          </Empty>
        </div>
      ) : (
        byCategory.map((g) => (
          <div className="card" key={g.key}>
            <h2>{g.label}</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Kod</th>
                    <th>Doküman</th>
                    <th>Durum</th>
                    <th>Güncelleme</th>
                  </tr>
                </thead>
                <tbody>
                  {g.docs.map((d) => (
                    <tr key={d.id}>
                      <td className="nowrap">{d.code}</td>
                      <td>
                        <Link href={`/dokumanlar/${d.id}`}>{d.title}</Link>
                      </td>
                      <td>{documentStatus(d)}</td>
                      <td className="nowrap">{formatDate(d.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}

      {canWrite && optional.length > 0 && (
        <div className="card">
          <h2>Opsiyonel şablonlar</h2>
          <p className="muted small">Kuruluşunuzun ihtiyacına göre ekleyebileceğiniz dokümanlar.</p>
          <ul className="list">
            {optional.map((t) => (
              <li key={t.code} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                <span>
                  <strong>{t.code}</strong> {t.title}{' '}
                  <span className="small muted">({DOCUMENT_CATEGORIES[t.category]})</span>
                </span>
                <button className="btn btn-small" onClick={() => addOptional(t)} disabled={busy !== null}>
                  {busy === t.code ? 'Ekleniyor…' : 'Ekle'}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
