'use client';

import { SUPPORT_CATEGORIES, SupportCategory } from '@kvkk/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { AttachmentField, useAttachments } from '@/components/support-thread';
import { Alert, ErrorAlert, Field, PageHeader } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import type { SupportTicketDetail } from '@/lib/types';

export default function NewTicketPage() {
  const router = useRouter();
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState<SupportCategory>('usage');
  const [body, setBody] = useState('');
  const attachments = useAttachments();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('subject', subject.trim());
      form.append('category', category);
      form.append('body', body.trim());
      for (const f of attachments.files) form.append('files', f);
      const t = await api<SupportTicketDetail>('support/tickets', { method: 'POST', body: form });
      router.push(`/destek/${t.id}`);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <>
      <p className="small">
        <Link href="/destek">← Destek</Link>
      </p>
      <PageHeader title="Yeni destek talebi" />
      <div className="card">
        <form className="form" onSubmit={submit}>
          <ErrorAlert error={error} />
          <div className="form-row">
            <Field label="Konu" required htmlFor="subject">
              <input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} required minLength={3} maxLength={200} />
            </Field>
            <Field label="Kategori" required htmlFor="category">
              <select id="category" value={category} onChange={(e) => setCategory(e.target.value as SupportCategory)}>
                {Object.entries(SUPPORT_CATEGORIES).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Açıklama" required htmlFor="body" hint="Ne yapmaya çalıştığınızı, hangi sayfada olduğunuzu ve aldığınız hata mesajını yazın.">
            <textarea
              id="body"
              rows={8}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onPaste={attachments.onPaste}
              required
              maxLength={10_000}
            />
          </Field>
          <AttachmentField state={attachments} />
          <Alert kind="info">
            Mesajınıza gerekmedikçe kişisel veri (ör. çalışan adı, TC kimlik numarası) yazmayın; ekran görüntülerinde bu
            bilgileri mümkünse kapatın.
          </Alert>
          <div>
            <button className="btn btn-primary" disabled={busy}>
              {busy ? 'Gönderiliyor…' : 'Talebi gönder'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
