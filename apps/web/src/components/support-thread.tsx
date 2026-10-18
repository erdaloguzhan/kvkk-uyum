'use client';

import { SUPPORT_ATTACHMENT_MAX_BYTES, SUPPORT_ATTACHMENT_MAX_FILES, SUPPORT_ATTACHMENT_MIME_TYPES } from '@kvkk/shared';
import { ClipboardEvent, FormEvent, ReactNode, useRef, useState } from 'react';
import { errorText } from '@/lib/api';
import { formatBytes, formatDateTime } from '@/lib/labels';
import type { SupportMessage } from '@/lib/types';
import { ErrorAlert, Field } from './ui';

const attachmentUrl = (id: string) => `/api/v1/support/attachments/${id}`;

/** Talebin yazışması. `showStaffName`: destek ekibi mesajlarında yanıtlayanın adı da gösterilir. */
export function SupportThread({ messages, showStaffName }: { messages: SupportMessage[]; showStaffName: boolean }) {
  return (
    <div className="thread">
      {messages.map((m) => (
        <div key={m.id} className={`msg${m.isStaff ? ' staff' : ''}`}>
          <div className="msg-head">
            <strong>
              {m.isStaff ? (showStaffName && m.authorName ? `Destek ekibi · ${m.authorName}` : 'Destek ekibi') : (m.authorName ?? 'Silinmiş kullanıcı')}
            </strong>
            <span>{formatDateTime(m.createdAt)}</span>
          </div>
          <div className="msg-body">{m.body}</div>
          {m.attachments.length > 0 && (
            <div className="msg-files">
              {m.attachments.map((a) =>
                a.mimeType.startsWith('image/') ? (
                  <a key={a.id} href={attachmentUrl(a.id)} target="_blank" rel="noreferrer" title={a.fileName}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={attachmentUrl(a.id)} alt={a.fileName} loading="lazy" />
                  </a>
                ) : (
                  <a key={a.id} className="btn btn-small" href={attachmentUrl(a.id)} target="_blank" rel="noreferrer">
                    📎 {a.fileName} ({formatBytes(a.size)})
                  </a>
                ),
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

const ACCEPT = SUPPORT_ATTACHMENT_MIME_TYPES.join(',');

/** Ek seçimi; ekran görüntüsü panodan metin kutusuna yapıştırılarak da eklenebilir (bkz. `pasteHandler`). */
export function useAttachments() {
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);

  function add(list: File[]) {
    setError(null);
    const next = [...files];
    for (const f of list) {
      if (!(SUPPORT_ATTACHMENT_MIME_TYPES as readonly string[]).includes(f.type)) {
        setError(`${f.name}: yalnızca PNG, JPEG, WEBP, GIF görsel veya PDF eklenebilir`);
      } else if (f.size > SUPPORT_ATTACHMENT_MAX_BYTES) {
        setError(`${f.name}: dosya en fazla 5 MB olabilir`);
      } else if (next.length >= SUPPORT_ATTACHMENT_MAX_FILES) {
        setError(`En fazla ${SUPPORT_ATTACHMENT_MAX_FILES} dosya eklenebilir`);
      } else {
        next.push(f);
      }
    }
    setFiles(next);
  }

  function onPaste(e: ClipboardEvent) {
    const pasted = Array.from(e.clipboardData.files);
    if (pasted.length === 0) return;
    e.preventDefault();
    // Panodaki görüntünün adı genelde "image.png"; birden fazla yapıştırmada ayırt edilsin.
    add(pasted.map((f, i) => new File([f], f.name === 'image.png' ? `ekran-goruntusu-${Date.now()}-${i + 1}.png` : f.name, { type: f.type })));
  }

  return { files, error, add, onPaste, remove: (i: number) => setFiles(files.filter((_, j) => j !== i)), clear: () => setFiles([]) };
}

export function AttachmentField({ state }: { state: ReturnType<typeof useAttachments> }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <Field
      label="Ekler"
      hint={`Ekran görüntüsü (PNG, JPEG) veya PDF; en fazla ${SUPPORT_ATTACHMENT_MAX_FILES} dosya, her biri 5 MB. Ekran görüntüsünü mesaj kutusuna yapıştırabilirsiniz (Ctrl+V).`}
    >
      <div className="file-chips">
        {state.files.map((f, i) => (
          <span key={`${f.name}-${i}`} className="chip">
            {f.name} ({formatBytes(f.size)})
            <button type="button" className="btn-link" aria-label={`${f.name} kaldır`} onClick={() => state.remove(i)}>
              ✕
            </button>
          </span>
        ))}
        <button type="button" className="btn btn-small" onClick={() => input.current?.click()}>
          + Dosya ekle
        </button>
      </div>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        onChange={(e) => {
          state.add(Array.from(e.target.files ?? []));
          e.target.value = '';
        }}
      />
      <ErrorAlert error={state.error} />
    </Field>
  );
}

/** Yazışmanın altındaki yanıt formu. `extraAction`: ikinci düğme (ör. yanıtla ve kapat); `onSend`'e close=true gelir. */
export function ReplyForm({
  onSend,
  placeholder,
  extraAction,
  note,
}: {
  onSend: (form: FormData, close: boolean) => Promise<void>;
  placeholder?: string;
  extraAction?: string;
  note?: ReactNode;
}) {
  const [body, setBody] = useState('');
  const attachments = useAttachments();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [closeAfter, setCloseAfter] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('body', body.trim());
      for (const f of attachments.files) form.append('files', f);
      await onSend(form, closeAfter);
      setBody('');
      attachments.clear();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
      setCloseAfter(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <ErrorAlert error={error} />
      {note}
      <Field label="Yanıtınız" required htmlFor="reply">
        <textarea
          id="reply"
          rows={5}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onPaste={attachments.onPaste}
          placeholder={placeholder}
          maxLength={10_000}
          required
        />
      </Field>
      <AttachmentField state={attachments} />
      <div className="actions">
        <button className="btn btn-primary" disabled={busy || !body.trim()} onClick={() => setCloseAfter(false)}>
          {busy ? 'Gönderiliyor…' : 'Gönder'}
        </button>
        {extraAction && (
          <button className="btn" disabled={busy || !body.trim()} onClick={() => setCloseAfter(true)}>
            {extraAction}
          </button>
        )}
      </div>
    </form>
  );
}
