'use client';

import { DEFAULT_APPROVAL_DUE_DAYS, DOCUMENT_CATEGORIES, DocumentCategory, PERMISSIONS } from '@kvkk/shared';
import { FormEvent, useEffect, useState } from 'react';
import { useMembers } from '@/lib/use-members';
import { Field, Modal } from './ui';

/** Onaylayacak Yönetici seçimi. Tek seçenek varsa kendiliğinden seçilir. */
function ApproverSelect({
  value,
  onChange,
  required,
}: {
  value: string;
  onChange: (id: string) => void;
  required: boolean;
}) {
  const { options, loading } = useMembers(PERMISSIONS.DOCUMENTS_APPROVE);
  useEffect(() => {
    if (required && !value && options.length === 1) onChange(options[0].id);
  }, [options, value, required, onChange]);
  return (
    <Field
      label="Onaylayacak Yönetici"
      htmlFor="approver"
      required={required}
      hint={
        required
          ? `Yalnızca doküman onay yetkisi olan üyeler listelenir. Onay için ${DEFAULT_APPROVAL_DUE_DAYS} gün süre verilir.`
          : 'Boş bırakırsanız işlem onaya gönderilmeden sizin yetkinizle yapılır.'
      }
    >
      <select id="approver" value={value} onChange={(e) => onChange(e.target.value)} required={required}>
        <option value="">{loading ? 'Yükleniyor…' : required ? 'Seçin' : 'Onaya göndermeden'}</option>
        {options.map((m) => (
          <option key={m.id} value={m.id}>
            {m.fullName} ({m.email})
          </option>
        ))}
      </select>
    </Field>
  );
}

export interface NewDocumentInput {
  file: File;
  code: string;
  title: string;
  category: DocumentCategory;
  note: string;
  approverId: string | null;
}

/** Sorumlunun kendi hazırladığı Word dosyasıyla yeni doküman eklemesi; doküman Yönetici onaylayınca yayına girer. */
export function NewDocumentDialog({
  canApprove,
  busy,
  onClose,
  onSubmit,
}: {
  /** Doküman onay yetkisi varsa onaya göndermek isteğe bağlıdır. */
  canApprove: boolean;
  busy: boolean;
  onClose: () => void;
  onSubmit: (input: NewDocumentInput) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<DocumentCategory | ''>('');
  const [note, setNote] = useState('');
  const [approverId, setApproverId] = useState('');
  return (
    <Modal open onClose={onClose} title="Yeni doküman ekle">
      <p className="muted">
        Kuruluşunuz için hazırladığınız Word dosyasını ekleyin. Doküman taslak olarak eklenir; Yönetici onaylayınca yayına girer.
      </p>
      <form
        className="form"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (!file || !category) return;
          onSubmit({ file, code: code.trim(), title: title.trim(), category, note: note.trim(), approverId: approverId || null });
        }}
      >
        <Field label="Doküman adı" htmlFor="doc-title" required>
          <input id="doc-title" value={title} onChange={(e) => setTitle(e.target.value)} required minLength={2} maxLength={200} />
        </Field>
        <Field label="Türü" htmlFor="doc-category" required>
          <select id="doc-category" value={category} onChange={(e) => setCategory(e.target.value as DocumentCategory)} required>
            <option value="">Seçin</option>
            {Object.entries(DOCUMENT_CATEGORIES).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Doküman kodu" htmlFor="doc-code" hint="Boş bırakılırsa KD-001, KD-002… biçiminde verilir.">
          <input id="doc-code" value={code} onChange={(e) => setCode(e.target.value)} maxLength={30} placeholder="ör. PRS-100" />
        </Field>
        <Field label="Dosya (.docx)" htmlFor="doc-file" hint="En fazla 10 MB" required>
          <input
            id="doc-file"
            type="file"
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            required
          />
        </Field>
        <ApproverSelect value={approverId} onChange={setApproverId} required={!canApprove} />
        <Field label="Not" htmlFor="doc-note">
          <textarea id="doc-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
        </Field>
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>
            Vazgeç
          </button>
          <button className="btn btn-primary" disabled={busy || !file || !category || (!canApprove && !approverId)}>
            {busy ? 'Ekleniyor…' : approverId ? 'Ekle ve onaya gönder' : 'Ekle'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * "… dokümanını çıkarmak istediğinizden emin misiniz?" sorusu. Onay yetkisi olmayan Sorumlu Yöneticiyi seçer;
 * doküman Yönetici onaylayınca listeden çıkarılır. Onay yetkisi olan kişi Evet derse hemen çıkarılır.
 */
export function RemoveDocumentDialog({
  label,
  canApprove,
  busy,
  onClose,
  onConfirm,
}: {
  /** Kod ve ad, ör. "AYM-030 Kamera Aydınlatma Metni". */
  label: string;
  canApprove: boolean;
  busy: boolean;
  onClose: () => void;
  onConfirm: (input: { approverId: string | null; note: string | null }) => void;
}) {
  const [approverId, setApproverId] = useState('');
  const [note, setNote] = useState('');
  return (
    <Modal open onClose={onClose} title="Dokümanı çıkar">
      <p>
        <strong>{label}</strong> dokümanını çıkarmak istediğinizden emin misiniz?
      </p>
      <form
        className="form"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          onConfirm({ approverId: approverId || null, note: note.trim() || null });
        }}
      >
        {!canApprove && (
          <p className="muted small" style={{ margin: 0 }}>
            Doküman, seçtiğiniz Yönetici onaylayınca listeden çıkarılır. Doküman ve geçmiş sürümleri kayıtlarda saklanır.
          </p>
        )}
        {!canApprove && <ApproverSelect value={approverId} onChange={setApproverId} required />}
        <Field label="Gerekçe" htmlFor="remove-note">
          <textarea id="remove-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
        </Field>
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>
            Hayır
          </button>
          <button className="btn btn-danger" disabled={busy || (!canApprove && !approverId)}>
            {busy ? 'Gönderiliyor…' : 'Evet'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
