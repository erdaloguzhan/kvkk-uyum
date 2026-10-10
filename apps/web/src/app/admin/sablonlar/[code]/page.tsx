'use client';

import { DOCUMENT_CATEGORIES } from '@kvkk/shared';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { TemplateFileField } from '@/components/template-file-field';
import { Alert, Badge, ErrorAlert, Field, Loading, Modal, PageHeader } from '@/components/ui';
import { api, download, errorText } from '@/lib/api';
import { formatBytes, formatDate, formatDateTime, todayIso } from '@/lib/labels';
import type { AdminTemplateDetail, TemplateVersion, TemplateVersionState } from '@/lib/types';
import { useApi } from '@/lib/use-api';

const STATE: Record<TemplateVersionState, { label: string; kind?: 'success' | 'warning' | 'info' }> = {
  draft: { label: 'Taslak', kind: 'warning' },
  current: { label: 'Yayında', kind: 'success' },
  scheduled: { label: 'Yayına alınacak', kind: 'info' },
  past: { label: 'Eski sürüm' },
};

type Dialog = { kind: 'upload' } | { kind: 'publish'; version: TemplateVersion } | { kind: 'edit' } | null;

export default function AdminTemplateDetailPage() {
  const { code } = useParams<{ code: string }>();
  const path = `admin/templates/${encodeURIComponent(decodeURIComponent(code))}`;
  const tpl = useApi<AdminTemplateDetail>(path);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (tpl.loading && !tpl.data) return <Loading />;
  if (!tpl.data) return <ErrorAlert error={tpl.error} />;
  const t = tpl.data;

  async function act(fn: () => Promise<string>) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      setMessage(await fn());
      setDialog(null);
      await tpl.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const fileOf = (v: TemplateVersion) => {
    setError(null);
    download(`${path}/versions/${v.id}/file`, v.fileName).catch((err) => setError(errorText(err)));
  };
  const unpublish = (v: TemplateVersion) => {
    if (!confirm(`v${v.versionNo} için planlanan yayın iptal edilsin mi? Sürüm taslağa döner.`)) return;
    act(async () => {
      await api(`${path}/versions/${v.id}/unpublish`, { method: 'POST' });
      return `v${v.versionNo} yayından çekildi, taslak olarak duruyor.`;
    });
  };
  const remove = (v: TemplateVersion) => {
    if (!confirm(`Taslak v${v.versionNo} silinsin mi?`)) return;
    act(async () => {
      await api(`${path}/versions/${v.id}`, { method: 'DELETE' });
      return `Taslak v${v.versionNo} silindi.`;
    });
  };

  return (
    <>
      <p className="small">
        <Link href="/admin/sablonlar">← Doküman şablonları</Link>
      </p>
      <PageHeader
        title={`${t.code} ${t.title}`}
        description={`${DOCUMENT_CATEGORIES[t.category]}${t.optional ? ' · opsiyonel' : ''}`}
        actions={
          <>
            <button className="btn btn-primary" onClick={() => setDialog({ kind: 'upload' })}>
              Yeni sürüm yükle
            </button>
            <button className="btn" onClick={() => setDialog({ kind: 'edit' })}>
              Başlığı düzenle
            </button>
          </>
        }
      />
      <ErrorAlert error={error} />
      {message && <Alert kind="success">{message}</Alert>}
      <Alert kind="info">
        Şablonu değiştirmek için yayındaki sürümü indirip Word ile düzenleyin, ardından &quot;Yeni sürüm yükle&quot; ile taslak olarak
        ekleyin. Taslağı yayınlarken yayın tarihini seçersiniz: o tarihten itibaren kuruluşların oluşturduğu yeni dokümanlar bu
        sürümden gelir. Kuruluşların mevcut dokümanları kendiliğinden değişmez; onlara &quot;yeni şablon sürümü var&quot; uyarısı
        gösterilir.
      </Alert>

      <div className="card">
        <h2>Sürümler</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Sürüm</th>
                <th>Durum</th>
                <th>Yayın tarihi</th>
                <th>Dosya</th>
                <th>Not</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {t.versions.map((v) => (
                <tr key={v.id}>
                  <td className="nowrap">v{v.versionNo}</td>
                  <td>
                    <Badge kind={STATE[v.state].kind}>{STATE[v.state].label}</Badge>
                  </td>
                  <td className="nowrap">{v.effectiveFrom ? formatDateTime(v.effectiveFrom) : '—'}</td>
                  <td>
                    <button className="btn-link" onClick={() => fileOf(v)}>
                      {v.fileName}
                    </button>
                    <div className="small muted">
                      {formatBytes(v.sizeBytes)} · yüklendi {formatDate(v.createdAt)}
                    </div>
                  </td>
                  <td>{v.note ?? '—'}</td>
                  <td className="nowrap">
                    {v.state === 'draft' && (
                      <>
                        <button
                          className="btn btn-small btn-primary"
                          onClick={() => setDialog({ kind: 'publish', version: v })}
                          disabled={busy}
                        >
                          Yayınla
                        </button>{' '}
                        <button className="btn btn-small btn-danger" onClick={() => remove(v)} disabled={busy}>
                          Sil
                        </button>
                      </>
                    )}
                    {v.state === 'scheduled' && (
                      <button className="btn btn-small" onClick={() => unpublish(v)} disabled={busy}>
                        Yayını iptal et
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {dialog?.kind === 'upload' && (
        <UploadDialog
          busy={busy}
          error={error}
          onClose={() => setDialog(null)}
          onSubmit={(file, note) =>
            act(async () => {
              const form = new FormData();
              form.append('file', file);
              if (note) form.append('note', note);
              const v = await api<TemplateVersion>(`${path}/versions`, { method: 'POST', body: form });
              return `v${v.versionNo} taslak olarak eklendi. Kontrol edip yayınlayabilirsiniz.`;
            })
          }
        />
      )}
      {dialog?.kind === 'publish' && (
        <PublishDialog
          version={dialog.version}
          busy={busy}
          error={error}
          onClose={() => setDialog(null)}
          onSubmit={(date) =>
            act(async () => {
              await api(`${path}/versions/${dialog.version.id}/publish`, {
                method: 'POST',
                body: { effectiveDate: date },
              });
              return date === todayIso()
                ? `v${dialog.version.versionNo} yayınlandı. Yeni dokümanlar bundan sonra bu sürümden üretilecek.`
                : `v${dialog.version.versionNo}, ${date.split('-').reverse().join('.')} tarihinde yayına girecek.`;
            })
          }
        />
      )}
      {dialog?.kind === 'edit' && (
        <EditDialog
          initial={t}
          busy={busy}
          error={error}
          onClose={() => setDialog(null)}
          onSubmit={(body) =>
            act(async () => {
              await api(path, { method: 'PATCH', body });
              return 'Şablon bilgileri kaydedildi.';
            })
          }
        />
      )}
    </>
  );
}

function UploadDialog({
  busy,
  error,
  onClose,
  onSubmit,
}: {
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (file: File, note: string) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState('');
  return (
    <Modal open onClose={onClose} title="Yeni sürüm yükle">
      <form
        className="form"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (file) onSubmit(file, note.trim());
        }}
      >
        <ErrorAlert error={error} />
        <TemplateFileField file={file} onChange={setFile} />
        <Field label="Değişiklik notu" htmlFor="note" hint="Ör. 2026 mevzuat değişikliği">
          <input id="note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
        </Field>
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>
            Vazgeç
          </button>
          <button className="btn btn-primary" disabled={busy || !file}>
            {busy ? 'Yükleniyor…' : 'Taslak olarak ekle'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function PublishDialog({
  version,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  version: TemplateVersion;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (date: string) => void;
}) {
  const today = todayIso();
  const [date, setDate] = useState(today);
  return (
    <Modal open onClose={onClose} title={`v${version.versionNo} sürümünü yayınla`}>
      <form
        className="form"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          onSubmit(date);
        }}
      >
        <ErrorAlert error={error} />
        <Field
          label="Yayın tarihi"
          required
          htmlFor="date"
          hint="Bugünü seçerseniz hemen yayına girer. İleri bir tarih seçerseniz o günün başından itibaren geçerli olur."
        >
          <input id="date" type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
        <p className="small muted">
          Bu tarihten sonra kuruluşların oluşturduğu dokümanlar bu sürümden gelir. Mevcut dokümanlar değişmez; kuruluşlar &quot;yeni
          şablonla güncelle&quot; ile yeni sürümü alabilir.
        </p>
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>
            Vazgeç
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Yayınlanıyor…' : date === today ? 'Şimdi yayınla' : 'Yayını planla'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EditDialog({
  initial,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  initial: { title: string; optional: boolean };
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (body: { title: string; optional: boolean }) => void;
}) {
  const [title, setTitle] = useState(initial.title);
  const [optional, setOptional] = useState(initial.optional);
  return (
    <Modal open onClose={onClose} title="Şablon bilgileri">
      <form
        className="form"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          onSubmit({ title: title.trim(), optional });
        }}
      >
        <ErrorAlert error={error} />
        <Field label="Başlık" required htmlFor="title" hint="Yeni oluşturulan dokümanlarda kullanılır.">
          <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required minLength={2} />
        </Field>
        <label className="checkbox">
          <input type="checkbox" checked={optional} onChange={(e) => setOptional(e.target.checked)} /> Opsiyonel
        </label>
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>
            Vazgeç
          </button>
          <button className="btn btn-primary" disabled={busy}>
            Kaydet
          </button>
        </div>
      </form>
    </Modal>
  );
}
