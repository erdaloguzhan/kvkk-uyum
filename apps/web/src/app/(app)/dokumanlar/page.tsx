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
import type { DocumentItem, DocumentTemplateItem } from '@/lib/types';
import { useApi } from '@/lib/use-api';

export default function DocumentsPage() {
  const { can } = useSession();
  const canWrite = can(PERMISSIONS.DOCUMENTS_WRITE);
  const canApprove = can(PERMISSIONS.DOCUMENTS_APPROVE);
  const docs = useApi<{ items: DocumentItem[] }>('documents');
  const templates = useApi<{ items: DocumentTemplateItem[] }>('document-templates');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ text: string; missingProfile: boolean } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ kind: 'new' } | { kind: 'remove'; doc: DocumentItem } | null>(null);

  if (docs.loading && !docs.data) return <Loading />;

  const items = docs.data?.items ?? [];

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
  const createFromTemplate = (t: DocumentTemplateItem) =>
    run(`template:${t.code}`, async () => {
      await api('documents', { method: 'POST', body: { templateCode: t.code } });
      return `${t.code} ${t.title} taslak olarak oluşturuldu. Gözden geçirip yayınlayabilirsiniz.`;
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

  // Kuruluşun hiç oluşturmadığı şablonlar; çıkardığı dokümanlar tekrar önerilmez (Erdal, 17.11 ve 28.11.2026).
  const newTemplates = (templates.data?.items ?? []).filter((t) => t.documentId === null && !t.removed);

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

      {/* Yalnızca ilk kurulumda: sonradan çıkarılan dokümanlar "eksik" diye listelenmez (Erdal, 17.11.2026). */}
      {canWrite && items.length === 0 && (
        <div className="card">
          <div className="card-header">
            <div>
              <h2>Dokümanlarınızı oluşturun</h2>
              <p className="muted small" style={{ margin: '4px 0 0' }}>
                Tüm şablonlardan kuruluşunuza özel dokümanlar oluşturulur. Kuruluşunuza uymayan dokümanı sonra listeden çıkarabilirsiniz.
              </p>
            </div>
            <button className="btn btn-primary" onClick={setup} disabled={busy !== null}>
              {busy === 'setup' ? 'Oluşturuluyor…' : 'Hepsini oluştur'}
            </button>
          </div>
        </div>
      )}

      {canWrite && items.length > 0 && newTemplates.length > 0 && (
        <div className="card">
          <h2>Yeni şablonlar</h2>
          <p className="muted small" style={{ margin: '4px 0 12px' }}>
            Kuruluşunuz için henüz oluşturulmamış şablonlar. Oluşturulan doküman taslak olarak eklenir; gözden geçirip yayınlayabilirsiniz.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Kod</th>
                  <th>Şablon</th>
                  <th>Tür</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {newTemplates.map((t) => (
                  <tr key={t.code}>
                    <td className="nowrap">{t.code}</td>
                    <td>
                      {t.title}
                      {t.optional && <span className="small muted"> (opsiyonel)</span>}
                    </td>
                    <td className="nowrap">{DOCUMENT_CATEGORIES[t.category as keyof typeof DOCUMENT_CATEGORIES] ?? t.category}</td>
                    <td className="nowrap">
                      <button className="btn btn-small" onClick={() => createFromTemplate(t)} disabled={busy !== null}>
                        {busy === `template:${t.code}` ? 'Oluşturuluyor…' : 'Oluştur'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
