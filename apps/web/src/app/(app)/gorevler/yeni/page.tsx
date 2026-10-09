'use client';

import { DEFAULT_REMINDER_DAYS, PERMISSIONS, TASK_ENTITY_TYPES, TASK_RECURRENCES, TASK_TYPES, TaskEntityType, TaskType } from '@kvkk/shared';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useState } from 'react';
import { Alert, ErrorAlert, Field, PageHeader } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { todayIso } from '@/lib/labels';
import { useSession } from '@/lib/session';
import type { Task } from '@/lib/types';
import { useMembers } from '@/lib/use-members';

const CREATABLE = (Object.keys(TASK_TYPES) as TaskType[]).filter((t) => t !== 'approval');
const REMINDER_CHOICES = [30, 14, 7, 3, 1, 0];

function NewTaskForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { me, can } = useSession();
  const { options: members, loading } = useMembers();
  const entityType = params.get('kayitTuru') as TaskEntityType | null;
  const entityId = params.get('kayit');
  const [title, setTitle] = useState(params.get('baslik') ?? '');
  const [type, setType] = useState<TaskType>((params.get('tur') as TaskType) ?? 'general');
  const [description, setDescription] = useState('');
  const [assigneeId, setAssigneeId] = useState(me?.id ?? '');
  const [dueDate, setDueDate] = useState('');
  const [reminderDays, setReminderDays] = useState<number[]>(DEFAULT_REMINDER_DAYS);
  const [recurrence, setRecurrence] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!can(PERMISSIONS.TASKS_MANAGE)) return <Alert kind="info">Görev oluşturma yetkiniz yok.</Alert>;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const task = await api<Task>('tasks', {
        method: 'POST',
        body: {
          title,
          type,
          description: description.trim() || null,
          assigneeId,
          dueDate,
          reminderDays,
          recurrenceMonths: recurrence ? Number(recurrence) : null,
          entityType: entityType && entityId ? entityType : null,
          entityId: entityType && entityId ? entityId : null,
        },
      });
      router.push(`/gorevler/${task.id}`);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  const toggleReminder = (d: number) =>
    setReminderDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort((a, b) => b - a)));

  return (
    <>
      <p className="small">
        <Link href="/gorevler">← Görevler</Link>
      </p>
      <PageHeader title="Yeni görev" description="Atanan kişiye bildirim ve e-posta gider; son tarih yaklaşınca hatırlatılır." />
      <div className="card">
        <form className="form" onSubmit={submit}>
          <ErrorAlert error={error} />
          {entityType && entityId && (
            <Alert kind="info">Bu görev bir {TASK_ENTITY_TYPES[entityType].toLocaleLowerCase('tr-TR')} kaydına bağlanacak.</Alert>
          )}
          <Field label="Başlık" htmlFor="title" required>
            <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required minLength={2} maxLength={200} />
          </Field>
          <div className="form-row">
            <Field label="Tür" htmlFor="type">
              <select id="type" value={type} onChange={(e) => setType(e.target.value as TaskType)}>
                {CREATABLE.map((t) => (
                  <option key={t} value={t}>
                    {TASK_TYPES[t]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Atanan kişi" htmlFor="assignee" required>
              <select id="assignee" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} required>
                <option value="">{loading ? 'Yükleniyor…' : 'Seçin'}</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.fullName} ({m.email})
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="form-row">
            <Field label="Son tarih" htmlFor="due" required>
              <input id="due" type="date" min={todayIso()} value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
            </Field>
            <Field label="Tekrarlama" htmlFor="recurrence" hint="Tekrarlayan görev tamamlanınca sonraki dönemin görevi otomatik açılır.">
              <select id="recurrence" value={recurrence} onChange={(e) => setRecurrence(e.target.value)}>
                <option value="">Tek seferlik</option>
                {TASK_RECURRENCES.map((r) => (
                  <option key={r.months} value={r.months}>
                    {r.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="field">
            <span className="field-label">Hatırlatma</span>
            <div className="actions">
              {REMINDER_CHOICES.map((d) => (
                <label className="checkbox" key={d}>
                  <input type="checkbox" checked={reminderDays.includes(d)} onChange={() => toggleReminder(d)} />
                  {d === 0 ? 'Son gün' : `${d} gün önce`}
                </label>
              ))}
            </div>
          </div>
          <Field label="Açıklama" htmlFor="description">
            <textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={5000} />
          </Field>
          <div>
            <button className="btn btn-primary" disabled={busy}>
              {busy ? 'Kaydediliyor…' : 'Görevi oluştur'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

export default function NewTaskPage() {
  return (
    <Suspense>
      <NewTaskForm />
    </Suspense>
  );
}
