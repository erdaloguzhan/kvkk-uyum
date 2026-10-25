'use client';

import { ChangeEvent, FormEvent, useRef, useState } from 'react';
import { api, errorText } from '@/lib/api';
import type { TrainingTopic } from '@/lib/types';
import { Markdown } from './markdown';
import { ErrorAlert, Field } from './ui';

export interface TopicDraft {
  title: string;
  content: string;
  minReadSeconds: number;
}

/** Metindeki görseller: ![açıklama](adres) */
const IMAGE_RE = /!\[([^\]]*)\]\(([^)\s]+)\)/g;

interface ImageRef {
  index: number;
  markup: string;
  alt: string;
  url: string;
}

function findImages(content: string): ImageRef[] {
  return [...content.matchAll(IMAGE_RE)].map((m) => ({ index: m.index, markup: m[0], alt: m[1], url: m[2] }));
}

const altFrom = (file: File) => file.name.replace(/\.[^.]+$/, '').replace(/[[\]]/g, '');

const HELP = '# Başlık · **kalın** · *italik* · - madde · 1. numaralı madde · > not kutusu · [bağlantı](https://…)';

/** Alt konu (ders anlatımı) düzenleyicisi: metin, görsel ekleme ve canlı önizleme. */
export function TopicEditor({
  topic,
  onSave,
  onCancel,
}: {
  topic: TrainingTopic | null;
  onSave: (draft: TopicDraft) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(topic?.title ?? '');
  const [content, setContent] = useState(topic?.content ?? '');
  const [minutes, setMinutes] = useState(String(Math.floor((topic?.minReadSeconds ?? 60) / 60)));
  const [seconds, setSeconds] = useState(String((topic?.minReadSeconds ?? 60) % 60));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const [replacing, setReplacing] = useState<ImageRef | null>(null);
  const images = findImages(content);

  function insert(text: string) {
    const el = textRef.current;
    const start = el?.selectionStart ?? content.length;
    const end = el?.selectionEnd ?? content.length;
    setContent(content.slice(0, start) + text + content.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + text.length, start + text.length);
    });
  }

  async function uploadFile(file: File): Promise<string | null> {
    const fd = new FormData();
    fd.append('file', file);
    setError(null);
    try {
      return (await api<{ url: string }>('training-admin/media', { method: 'POST', body: fd })).url;
    } catch (err) {
      setError(errorText(err));
      return null;
    }
  }

  async function upload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const url = await uploadFile(file);
    if (url) insert(`\n![${altFrom(file)}](${url})\n`);
  }

  /** Metindeki görseli yeni yüklenen dosyayla değiştirir (yeri ve açıklaması korunur). */
  async function replaceImage(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    const target = replacing;
    setReplacing(null);
    if (!file || !target) return;
    const url = await uploadFile(file);
    if (!url) return;
    setContent((current) => {
      const at = current.indexOf(target.markup, Math.max(0, target.index - 1));
      if (at < 0) return current;
      return current.slice(0, at) + `![${target.alt || altFrom(file)}](${url})` + current.slice(at + target.markup.length);
    });
  }

  /** Görseli metinden çıkarır; yalnızca bu satırda duruyorsa satır da silinir. */
  function removeImage(image: ImageRef) {
    if (!confirm('Görsel ders anlatımından kaldırılsın mı?')) return;
    setContent((current) => {
      const at = current.indexOf(image.markup, Math.max(0, image.index - 1));
      if (at < 0) return current;
      let start = at;
      let end = at + image.markup.length;
      const lineStart = current.lastIndexOf('\n', start - 1) + 1;
      const lineEnd = current.indexOf('\n', end);
      const before = current.slice(lineStart, start);
      const after = current.slice(end, lineEnd < 0 ? current.length : lineEnd);
      if (!before.trim() && !after.trim()) {
        start = lineStart;
        end = lineEnd < 0 ? current.length : lineEnd + 1;
      }
      return current.slice(0, start) + current.slice(end);
    });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSave({ title, content, minReadSeconds: (Number(minutes) || 0) * 60 + (Number(seconds) || 0) });
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <form className="card form" onSubmit={submit}>
      <h2>{topic ? 'Alt konuyu düzenle' : 'Yeni alt konu'}</h2>
      <ErrorAlert error={error} />
      <div className="form-row">
        <Field label="Alt konu adı" required htmlFor="topic-title" hint='Örnek: "Mevzuat"'>
          <input id="topic-title" value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus />
        </Field>
        <Field label="En az okuma süresi" hint="Bu süre dolmadan katılımcı sonraki konuya geçemez.">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="number" min={0} max={180} value={minutes} onChange={(e) => setMinutes(e.target.value)} style={{ width: 90 }} aria-label="Dakika" />
            dk
            <input type="number" min={0} max={59} value={seconds} onChange={(e) => setSeconds(e.target.value)} style={{ width: 90 }} aria-label="Saniye" />
            sn
          </div>
        </Field>
      </div>
      <div className="field">
        <div className="card-header" style={{ marginBottom: 0 }}>
          <span className="field-label">Ders anlatımı</span>
          <span className="actions">
            <button type="button" className="btn btn-small" onClick={() => fileRef.current?.click()}>
              Görsel ekle
            </button>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={upload} />
          </span>
        </div>
        <span className="hint">{HELP}</span>
        {images.length > 0 && (
          <div className="topic-images" aria-label="Eklenen görseller">
            {images.map((image, i) => (
              <div key={`${image.index}-${image.url}`} className="topic-image">
                <img src={image.url} alt={image.alt} />
                <span className="small" title={image.alt}>
                  {image.alt || `Görsel ${i + 1}`}
                </span>
                <span className="actions">
                  <button
                    type="button"
                    className="btn btn-small"
                    onClick={() => {
                      setReplacing(image);
                      replaceRef.current?.click();
                    }}
                  >
                    Değiştir
                  </button>
                  <button type="button" className="btn btn-small btn-danger" onClick={() => removeImage(image)}>
                    Sil
                  </button>
                </span>
              </div>
            ))}
            <input ref={replaceRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={replaceImage} />
          </div>
        )}
        <div className="editor-grid">
          <textarea ref={textRef} value={content} onChange={(e) => setContent(e.target.value)} aria-label="Ders anlatımı" />
          <div className="editor-preview" aria-label="Önizleme">
            {content.trim() ? <Markdown source={content} /> : <span className="muted">Önizleme burada görünür.</span>}
          </div>
        </div>
      </div>
      <div className="actions" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn" onClick={onCancel}>
          Vazgeç
        </button>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Kaydediliyor…' : 'Kaydet'}
        </button>
      </div>
    </form>
  );
}
