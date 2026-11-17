'use client';

import { DOCUMENT_CATEGORIES, PERMISSIONS } from '@kvkk/shared';
import Link from 'next/link';
import { useState } from 'react';
import { NewDocumentDialog, NewDocumentInput, RemoveDocumentDialog } from '@/components/document-dialogs';
import { documentStatus } from '@/components/document-status';
import { Alert, Badge, Empty, ErrorAlert, Loading, PageHeader } from '@/components/ui';
import { api, ApiError, errorText } from '@/lib/api';
import { formatDate } from '@/lib/labels';
import { useSession } from '@/lib/session';
import type { DocumentItem, TemplateItem } from '@/lib/types';
import { useApi } from '@/lib/use-api';

export default function DocumentsPage() {
  const { can } = useSession();
  const canWrite = can(PERMISSIONS.DOCUMENTS_WRITE);
  const canApprove = can(PERMISSIONS.DOCUMENTS_APPROVE);
  const docs = useApi<{ items: DocumentItem[] }>('documents');
  const templates = useApi<{ items: TemplateItem[] }>('document-templates');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ text: string; missingProfile: boolean } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ kind: 'new' } | { kind: 'remove'; doc: DocumentItem } | null>(null);

  if (docs.loading && !docs.data) return <Loading />;

  const items = docs.data?.items ?? [];
  const tpl = templates.data?.items ?? [];
  // Opsiyonel şablonlar da diğerleriyle birlikte oluşturulur (Erdal, 17.11.2026).
  const missing = tpl.filter((t) => !t.documentId);

  async function run(key: string, fn: () => Promise<string>) {
    setBusy(key);
    setError(null);
    setMessage(null);
    try {
      setMessage(await fn());
      setDialog(null);
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
  const addTemplate = (t: TemplateItem) =>
    run(t.code, async () => {
      await api('documents', { method: 'POST', body: { templateCode: t.code } });
      return `${t.code} ${t.title} oluşturuldu.`;
    });
  const addOwn = (input: NewDocumentInput) =>
    run('new', async () => {
      const form = new FormData();
      form.append('file', input.file);
      form.append('title', input.title);
      form.append('category', input.category);
      if (input.code) form.append('code', input.code);
      if (input.note) form.append('note', input.note);
      const doc = await api<{ id: string; code: string; title: string; versions: { id: string }[] }>('documents/own', {
        method: 'POST',
        body: form,
      });
      const label = `${doc.code} ${doc.title}`;
      if (!input.approverId) return `${label} taslak olarak eklendi. Doküman sayfasından yayınlayabilirsiniz.`;
      try {
        await api(`documents/${doc.id}/versions/${doc.versions[0].id}/approval-requests`, {
          method: 'POST',
          body: { approverId: input.approverId, note: input.note || null },
        });
      } catch (err) {
        setDialog(null); // Doküman eklendi; pencere açık kalırsa ikinci kez eklenebilir.
        throw new Error(`${label} taslak olarak eklendi ama onaya gönderilemedi: ${errorText(err)} Doküman sayfasından yeniden gönderebilirsiniz.`);
      }
      window.dispatchEvent(new Event('kvkk:notifications'));
      return `${label} eklendi ve Yönetici onayına gönderildi. Onaylanınca yayına girer.`;
    });
  const remove = (d: DocumentItem, input: { approverId: string | null; note: string | null }) =>
    run(`remove:${d.id}`, async () => {
      const label = `${d.code} ${d.title}`;
      if (!input.approverId) {
        await api(`documents/${d.id}/remove`, { method: 'POST', body: { note: input.note } });
        return `${label} listeden çıkarıldı.`;
      }
      await api(`documents/${d.id}/removal-requests`, { method: 'POST', body: { approverId: input.approverId, note: input.note } });
      window.dispatchEvent(new Event('kvkk:notifications'));
      return `${label} için çıkarma talebi Yönetici onayına gönderildi. Onaylanınca listeden çıkarılır.`;
    });

  const byCategory = Object.entries(DOCUMENT_CATEGORIES)
    .map(([key, label]) => ({ key, label, docs: items.filter((d) => d.category === key) }))
    .filter((g) => g.docs.length > 0);

  return (
    <>
      <PageHeader
        title="Dokümanlar"
        description="KVKK politika, prosedür, form ve aydınlatma metinleri. Şablonlar kuruluş bilgilerinizle doldurulur."
        actions={
          canWrite && (
            <button className="btn btn-primary" onClick={() => setDialog({ kind: 'new' })} disabled={busy !== null}>
              Yeni doküman ekle
            </button>
          )
        }
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

      {canWrite && missing.length > 0 && (
        <div className="card">
          <div className="card-header">
            <div>
              <h2>{items.length === 0 ? 'Dokümanlarınızı oluşturun' : 'Eksik dokümanlar'}</h2>
              <p className="muted small" style={{ margin: '4px 0 0' }}>
                {missing.length} şablondan doküman henüz oluşturulmadı. Kuruluşunuza uymayan dokümanı oluşturduktan sonra
                listeden çıkarabilirsiniz.
              </p>
            </div>
            <button className="btn btn-primary" onClick={setup} disabled={busy !== null}>
              {busy === 'setup' ? 'Oluşturuluyor…' : 'Hepsini oluştur'}
            </button>
          </div>
          {items.length > 0 && (
            <ul className="list">
              {missing.map((t) => (
                <li key={t.code} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                  <span>
                    <strong>{t.code}</strong> {t.title} <span className="small muted">({DOCUMENT_CATEGORIES[t.category]})</span>
                  </span>
                  <button className="btn btn-small" onClick={() => addTemplate(t)} disabled={busy !== null}>
                    {busy === t.code ? 'Ekleniyor…' : 'Ekle'}
                  </button>
                </li>
              ))}
            </ul>
          )}
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
                    {canWrite && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {g.docs.map((d) => (
                    <tr key={d.id}>
                      <td className="nowrap">{d.code}</td>
                      <td>
                        <Link href={`/dokumanlar/${d.id}`}>{d.title}</Link>
                      </td>
                      <td>
                        {documentStatus(d)}
                        {d.pendingRemoval && (
                          <div style={{ marginTop: 4 }}>
                            <Badge kind="danger">Çıkarma onayı bekliyor: {d.pendingRemoval.approver.fullName}</Badge>
                          </div>
                        )}
                      </td>
                      <td className="nowrap">{formatDate(d.updatedAt)}</td>
                      {canWrite && (
                        <td className="nowrap">
                          {!d.pendingRemoval && (
                            <button className="btn btn-small" onClick={() => setDialog({ kind: 'remove', doc: d })} disabled={busy !== null}>
                              Çıkar
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}

      {dialog?.kind === 'new' && (
        <NewDocumentDialog canApprove={canApprove} busy={busy !== null} onClose={() => setDialog(null)} onSubmit={addOwn} />
      )}
      {dialog?.kind === 'remove' && (
        <RemoveDocumentDialog
          label={`${dialog.doc.code} ${dialog.doc.title}`}
          canApprove={canApprove}
          busy={busy !== null}
          onClose={() => setDialog(null)}
          onConfirm={(input) => remove(dialog.doc, input)}
        />
      )}
    </>
  );
}
