'use client';

import { DEFAULT_APPROVAL_DUE_DAYS, Permission } from '@kvkk/shared';
import { useState } from 'react';
import { useMembers } from '@/lib/use-members';
import { Field, Modal } from './ui';

/** Not veya gerekçe isteyen onay penceresi (ret gerekçesi, yeniden oluşturma notu). */
export function NoteDialog({
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

/** Onaylayacak kişiyi, son tarihi ve notu seçtiren onay talebi penceresi. */
export function ApproverDialog({
  title,
  permission,
  hint,
  busy,
  onClose,
  onSubmit,
}: {
  title: string;
  permission: Permission;
  hint: string;
  busy: boolean;
  onClose: () => void;
  onSubmit: (body: { approverId: string; dueDate: string | null; note: string | null }) => void;
}) {
  const { options, loading } = useMembers(permission);
  const [approverId, setApproverId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [note, setNote] = useState('');
  return (
    <Modal open onClose={onClose} title={title}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({ approverId, dueDate: dueDate || null, note: note.trim() || null });
        }}
      >
        <Field label="Onaylayacak kişi" htmlFor="approver" required hint={hint}>
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
