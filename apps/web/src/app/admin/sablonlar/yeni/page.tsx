'use client';

import { DOCUMENT_CATEGORIES, DocumentCategory } from '@kvkk/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { ErrorAlert, Field, PageHeader } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import type { AdminTemplateDetail } from '@/lib/types';
import { TemplateFileField } from '@/components/template-file-field';

export default function NewTemplatePage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<DocumentCategory>('policy');
  const [optional, setOptional] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('code', code.trim());
      form.append('title', title.trim());
      form.append('category', category);
      form.append('optional', String(optional));
      if (note.trim()) form.append('note', note.trim());
      form.append('file', file);
      const t = await api<AdminTemplateDetail>('admin/templates', { method: 'POST', body: form });
      router.push(`/admin/sablonlar/${encodeURIComponent(t.code)}`);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <>
      <p className="small">
        <Link href="/admin/sablonlar">← Doküman şablonları</Link>
      </p>
      <PageHeader
        title="Yeni şablon"
        description="Şablon önce taslak olarak eklenir. Yayınladığınızda kuruluşların doküman listesinde görünür."
      />
      <div className="card">
        <form className="form" onSubmit={submit}>
          <ErrorAlert error={error} />
          <div className="form-row">
            <Field label="Kod" required htmlFor="code" hint="Ör. POL-030, PRS-040">
              <input id="code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} required pattern="[A-Za-z]{2,5}-\d{3}" />
            </Field>
            <Field label="Tür" required htmlFor="category">
              <select id="category" value={category} onChange={(e) => setCategory(e.target.value as DocumentCategory)}>
                {Object.entries(DOCUMENT_CATEGORIES).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Başlık" required htmlFor="title">
            <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required minLength={2} />
          </Field>
          <label className="checkbox">
            <input type="checkbox" checked={optional} onChange={(e) => setOptional(e.target.checked)} /> Opsiyonel (kuruluş ihtiyacına göre
            eklenir, toplu kurulumda otomatik oluşturulmaz)
          </label>
          <TemplateFileField file={file} onChange={setFile} />
          <Field label="Not" htmlFor="note">
            <input id="note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
          </Field>
          <div>
            <button className="btn btn-primary" disabled={busy || !file}>
              {busy ? 'Ekleniyor…' : 'Şablonu ekle'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
