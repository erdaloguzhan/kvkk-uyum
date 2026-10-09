'use client';

import { APPROVAL_STATUSES, DEFAULT_APPROVAL_DUE_DAYS, DOCUMENT_CATEGORIES, PERMISSIONS } from '@kvkk/shared';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { CompactTaskList } from '@/components/task-list';
import { Alert, Badge, Empty, ErrorAlert, Field, Loading, Modal, PageHeader } from '@/components/ui';
import { api, download, errorText } from '@/lib/api';
import { formatBytes, formatDateTime, formatDay } from '@/lib/labels';
import { useSession } from '@/lib/session';
import type { ApprovalRequest, DocumentDetail, DocumentVersion, Task } from '@/lib/types';
import { useApi } from '@/lib/use-api';
import { useMembers } from '@/lib/use-members';

const VERSION_STATUS: Record<DocumentVersion['status'], { label: string; kind?: 'success' | 'warning' }> = {
  draft: { label: 'Taslak', kind: 'warning' },
  published: { label: 'Yayında', kind: 'success' },
  superseded: { label: 'Eski sürüm' },
};

const APPROVAL_KIND = { pending: 'warning', approved: 'success', rejected: 'danger', cancelled: undefined } as const;

type Dialog =
  | { kind: 'upload' }
  | { kind: 'regenerate' }
  | { kind: 'request'; version: DocumentVersion }
  | { kind: 'reject'; request: ApprovalRequest }
  | null;

export default function DocumentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { me, can } = useSession();
  const canWrite = can(PERMISSIONS.DOCUMENTS_WRITE);
  const canApprove = can(PERMISSIONS.DOCUMENTS_APPROVE);
  const doc = useApi<DocumentDetail>(`documents/${id}`);
  const approvals = useApi<{ items: ApprovalRequest[] }>('approval-requests', { documentId: id });
  const tasks = useApi<{ items: Task[] }>('tasks', { entityType: 'document', entityId: id, status: 'open' });
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (doc.loading && !doc.data) return <Loading />;
  if (!doc.data) return <ErrorAlert error={doc.error} />;
  const d = doc.data;
  const published = d.versions.find((v) => v.id === d.publishedVersionId);
  const pendingByVersion = new Map(
    (approvals.data?.items ?? []).filter((a) => a.status === 'pending').map((a) => [a.version.id, a]),
  );

  async function act(fn: () => Promise<string | void>, close = true) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const msg = await fn();
      if (msg) setMessage(msg);
      if (close) setDialog(null);
      await Promise.all([doc.reload(), approvals.reload(), tasks.reload()]);
      window.dispatchEvent(new Event('kvkk:notifications'));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const fileOf = (v: DocumentVersion) =>
    act(() => download(`documents/${d.id}/versions/${v.id}/file`, v.fileName), false);
  const publish = (v: DocumentVersion) => {
    if (!confirm(`Sürüm ${v.versionNo} yayınlansın mı? Yayındaki önceki sürüm eski sürüm olarak saklanır.`)) return;
    act(async () => {
      await api(`documents/${d.id}/versions/${v.id}/publish`, { method: 'POST' });
      return `Sürüm ${v.versionNo} yayınlandı.`;
    });
  };
  const approve = (a: ApprovalRequest) =>
    act(async () => {
      await api(`approval-requests/${a.id}/approve`, { method: 'POST', body: {} });
      return `Onaylandı; sürüm ${a.version.versionNo} yayınlandı.`;
    });
  const cancelRequest = (a: ApprovalRequest) =>
    act(async () => {
      await api(`approval-requests/${a.id}/cancel`, { method: 'POST' });
      return 'Onay talebi geri alındı.';
    });

  return (
    <>
      <p className="small">
        <Link href="/dokumanlar">← Dokümanlar</Link>
      </p>
      <PageHeader
        title={`${d.code} ${d.title}`}
        description={DOCUMENT_CATEGORIES[d.category]}
        actions={
          <>
            {published && (
              <button className="btn btn-primary" onClick={() => fileOf(published)} disabled={busy}>
                Yayındaki sürümü indir
              </button>
            )}
            {canWrite && (
              <>
                <button className="btn" onClick={() => setDialog({ kind: 'upload' })}>
                  Düzenlenmiş Word dosyasını yükle
                </button>
                {d.templateCode && (
                  <button className="btn" onClick={() => setDialog({ kind: 'regenerate' })}>
                    Bilgilerle yeniden oluştur
                  </button>
                )}
              </>
            )}
          </>
        }
      />
      <ErrorAlert error={error} />
      {message && <Alert kind="success">{message}</Alert>}
      {canWrite && (
        <Alert kind="info">
          Dokümanı düzenlemek için sürümü indirip Word ile değiştirin, sonra &quot;Düzenlenmiş Word dosyasını yükle&quot; ile yeni sürüm
          olarak ekleyin. Taslak sürümü doğrudan yayınlayabilir veya bir onaylayıcıya gönderebilirsiniz.
        </Alert>
      )}

      <div className="card">
        <h2>Sürümler</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Sürüm</th>
                <th>Durum</th>
                <th>Kaynak</th>
                <th>Tarih</th>
                <th>Not</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {d.versions.map((v) => {
                const pending = pendingByVersion.get(v.id);
                return (
                  <tr key={v.id}>
                    <td className="nowrap">v{v.versionNo}</td>
                    <td>
                      <Badge kind={VERSION_STATUS[v.status].kind}>{VERSION_STATUS[v.status].label}</Badge>
                      {pending && (
                        <div className="small muted" style={{ marginTop: 4 }}>
                          Onay bekliyor: {pending.approver.fullName}
                        </div>
                      )}
                    </td>
                    <td className="small">
                      {v.source === 'template' ? 'Şablondan oluşturuldu' : 'Yüklendi'}
                      <div className="muted">{formatBytes(v.sizeBytes)}</div>
                      {v.unfilledPlaceholders.length > 0 && (
                        <div className="muted">Boş bırakılan: {v.unfilledPlaceholders.join(', ')}</div>
                      )}
                    </td>
                    <td className="small nowrap">{formatDateTime(v.createdAt)}</td>
                    <td className="small">{v.note ?? '—'}</td>
                    <td>
                      <div className="actions">
                        <button className="btn btn-small" onClick={() => fileOf(v)} disabled={busy}>
                          İndir
                        </button>
                        {v.status === 'draft' && canApprove && (
                          <button className="btn btn-small btn-primary" onClick={() => publish(v)} disabled={busy}>
                            Yayınla
                          </button>
                        )}
                        {v.status === 'draft' && canWrite && !pending && (
                          <button className="btn btn-small" onClick={() => setDialog({ kind: 'request', version: v })} disabled={busy}>
                            Onaya gönder
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <h2>Onay talepleri</h2>
          {(approvals.data?.items ?? []).length === 0 ? (
            <Empty title="Onay talebi yok" />
          ) : (
            <ul className="list">
              {approvals.data!.items.map((a) => (
                <li key={a.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <strong>Sürüm {a.version.versionNo}</strong>
                    <Badge kind={APPROVAL_KIND[a.status]}>{APPROVAL_STATUSES[a.status]}</Badge>
                  </div>
                  <div className="small muted">
                    {a.requestedBy?.fullName ?? '—'} → {a.approver.fullName} · {formatDateTime(a.createdAt)}
                    {a.status === 'pending' && a.dueDate && <> · Son tarih {formatDay(a.dueDate)}</>}
                  </div>
                  {a.note && <div className="small">Not: {a.note}</div>}
                  {a.decisionNote && <div className="small">Karar notu: {a.decisionNote}</div>}
                  {a.status === 'pending' && (
                    <div className="actions" style={{ marginTop: 8 }}>
                      {a.approver.id === me?.id && canApprove && (
                        <>
                          <button className="btn btn-small btn-primary" onClick={() => approve(a)} disabled={busy}>
                            Onayla ve yayınla
                          </button>
                          <button className="btn btn-small btn-danger" onClick={() => setDialog({ kind: 'reject', request: a })} disabled={busy}>
                            Reddet
                          </button>
                        </>
                      )}
                      {canWrite && (
                        <button className="btn btn-small" onClick={() => cancelRequest(a)} disabled={busy}>
                          Talebi geri al
                        </button>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="card">
          <div className="card-header">
            <h2>Açık görevler</h2>
            {can(PERMISSIONS.TASKS_MANAGE) && (
              <Link
                className="btn btn-small"
                href={`/gorevler/yeni?tur=document_review&kayitTuru=document&kayit=${d.id}&baslik=${encodeURIComponent(`${d.code} gözden geçirme`)}`}
              >
                Gözden geçirme görevi ekle
              </Link>
            )}
          </div>
          {(tasks.data?.items ?? []).length === 0 ? <Empty title="Bu dokümana bağlı açık görev yok" /> : <CompactTaskList tasks={tasks.data!.items} />}
        </div>
      </div>

      {dialog?.kind === 'upload' && (
        <UploadDialog
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(file, note) =>
            act(async () => {
              const form = new FormData();
              form.append('file', file);
              if (note) form.append('note', note);
              const v = await api<DocumentVersion>(`documents/${d.id}/versions`, { method: 'POST', body: form });
              return `Sürüm ${v.versionNo} taslak olarak eklendi.`;
            })
          }
        />
      )}
      {dialog?.kind === 'regenerate' && (
      <NoteDialog
        title="Kuruluş bilgileriyle yeniden oluştur"
        text="Şablon, kuruluşun güncel bilgileriyle yeniden doldurulur ve yeni taslak sürüm olarak eklenir. Word'de yaptığınız değişiklikler bu sürüme taşınmaz."
        submitLabel="Yeni sürüm oluştur"
        busy={busy}
        onClose={() => setDialog(null)}
        onSubmit={(note) =>
          act(async () => {
            const v = await api<DocumentVersion>(`documents/${d.id}/regenerate`, { method: 'POST', body: { note: note || null } });
            return `Sürüm ${v.versionNo} taslak olarak oluşturuldu.`;
          })
        }
      />
      )}
      {dialog?.kind === 'request' && (
        <RequestDialog
          version={dialog.version}
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(body) =>
            act(async () => {
              await api(`documents/${d.id}/versions/${dialog.version.id}/approval-requests`, { method: 'POST', body });
              return 'Onay talebi gönderildi. Onaylayan kişiye görev ve bildirim gitti.';
            })
          }
        />
      )}
      {dialog?.kind === 'reject' && (
      <NoteDialog
        title="Onay talebini reddet"
        text="Ret gerekçesi talep eden kişiye iletilir."
        submitLabel="Reddet"
        required
        busy={busy}
        onClose={() => setDialog(null)}
        onSubmit={(note) =>
          act(async () => {
            if (dialog?.kind !== 'reject') return;
            await api(`approval-requests/${dialog.request.id}/reject`, { method: 'POST', body: { note } });
            return 'Talep reddedildi.';
          })
        }
      />
      )}
    </>
  );
}

function UploadDialog({
  busy,
  onClose,
  onSubmit,
}: {
  busy: boolean;
  onClose: () => void;
  onSubmit: (file: File, note: string) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState('');
  return (
    <Modal open onClose={onClose} title="Word dosyası yükle">
      <form
        className="form"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (file) onSubmit(file, note.trim());
        }}
      >
        <Field label="Dosya (.docx)" htmlFor="file" hint="En fazla 10 MB">
          <input
            id="file"
            type="file"
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            required
          />
        </Field>
        <Field label="Değişiklik notu" htmlFor="note">
          <input id="note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
        </Field>
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>
            Vazgeç
          </button>
          <button className="btn btn-primary" disabled={busy || !file}>
            {busy ? 'Yükleniyor…' : 'Yükle'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function NoteDialog({
  title,
  text,
  submitLabel,
  required,
  busy,
  onClose,
  onSubmit,
}: {
  title: string;
  text: string;
  submitLabel: string;
  required?: boolean;
  busy: boolean;
  onClose: () => void;
  onSubmit: (note: string) => void;
}) {
  const [note, setNote] = useState('');
  return (
    <Modal open onClose={onClose} title={title}>
      <p className="muted">{text}</p>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(note.trim());
        }}
      >
        <Field label={required ? 'Gerekçe' : 'Not'} htmlFor="dialog-note" required={required}>
          <textarea id="dialog-note" value={note} onChange={(e) => setNote(e.target.value)} required={required} minLength={required ? 2 : undefined} />
        </Field>
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>
            Vazgeç
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Kaydediliyor…' : submitLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function RequestDialog({
  version,
  busy,
  onClose,
  onSubmit,
}: {
  version: DocumentVersion;
  busy: boolean;
  onClose: () => void;
  onSubmit: (body: { approverId: string; dueDate: string | null; note: string | null }) => void;
}) {
  const { options, loading } = useMembers(PERMISSIONS.DOCUMENTS_APPROVE);
  const [approverId, setApproverId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [note, setNote] = useState('');
  return (
    <Modal open onClose={onClose} title={`Sürüm ${version.versionNo} için onay iste`}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({ approverId, dueDate: dueDate || null, note: note.trim() || null });
        }}
      >
        <Field label="Onaylayacak kişi" htmlFor="approver" required hint="Yalnızca doküman onay yetkisi olan üyeler listelenir.">
          <select id="approver" value={approverId} onChange={(e) => setApproverId(e.target.value)} required>
            <option value="">{loading ? 'Yükleniyor…' : 'Seçin'}</option>
            {options.map((m) => (
              <option key={m.id} value={m.id}>
                {m.fullName} ({m.email})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Son tarih" htmlFor="due" hint={`Boş bırakılırsa ${DEFAULT_APPROVAL_DUE_DAYS} gün sonrası`}>
          <input id="due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
        <Field label="Not" htmlFor="req-note">
          <textarea id="req-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
        </Field>
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>
            Vazgeç
          </button>
          <button className="btn btn-primary" disabled={busy || !approverId}>
            {busy ? 'Gönderiliyor…' : 'Onaya gönder'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
