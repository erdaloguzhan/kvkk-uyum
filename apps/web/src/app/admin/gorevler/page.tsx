'use client';

import { DEFAULT_REMINDER_DAYS } from '@kvkk/shared';
import { FormEvent, useState } from 'react';
import { dueBadge } from '@/components/task-list';
import { Empty, ErrorAlert, Field, Loading, Modal, PageHeader } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { formatDate, formatDay, todayIso } from '@/lib/labels';
import { useSession } from '@/lib/session';
import type { Trainer, TrainerTask } from '@/lib/types';
import { useApi } from '@/lib/use-api';

type TabKey = 'open' | 'done' | 'cancelled';
const TABS: { key: TabKey; label: string }[] = [
  { key: 'open', label: 'Açık görevler' },
  { key: 'done', label: 'Tamamlananlar' },
  { key: 'cancelled', label: 'İptal edilenler' },
];
const REMINDER_CHOICES = [30, 14, 7, 3, 1, 0];

/**
 * Eğitmen görevleri. Platform yöneticisi (Bi Artı'nın KVK Uyum Yöneticisi) eğitmenlere görev atar; eğitmen kendisine
 * atananları görür ve tamamlar. Son tarihten önce hatırlatma bildirimi ve e-postası gider.
 */
export default function TrainerTasksPage() {
  const { role } = useSession();
  const isAdmin = role?.kind === 'admin';
  const [tab, setTab] = useState<TabKey>('open');
  const list = useApi<{ items: TrainerTask[] }>('training-admin/trainer-tasks', { status: tab, mine: !isAdmin || undefined });
  const [creating, setCreating] = useState(false);
  const [closing, setClosing] = useState<{ task: TrainerTask; action: 'complete' | 'cancel' } | null>(null);
  const items = list.data?.items ?? [];

  return (
    <>
      <PageHeader
        title={isAdmin ? 'Eğitmen görevleri' : 'Görevler'}
        description={
          isAdmin
            ? 'Eğitmenlere atadığınız görevler. Son tarihten önce eğitmene hatırlatma gider; süre geçerse size de bildirilir.'
            : 'KVK Uyum Yöneticisinin size atadığı görevler. Son tarihten önce hatırlatma bildirimi gönderilir.'
        }
        actions={
          isAdmin && (
            <button className="btn btn-primary" onClick={() => setCreating(true)}>
              + Görev ata
            </button>
          )
        }
      />
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={t.key === tab} className={`tab${t.key === tab ? ' active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      <ErrorAlert error={list.error} />
      {list.loading && !list.data ? (
        <Loading />
      ) : items.length === 0 ? (
        <div className="card">
          <Empty title="Bu listede görev yok" />
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Görev</th>
                {isAdmin && <th>Eğitmen</th>}
                <th>Son tarih</th>
                <th>Durum</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((t) => (
                <tr key={t.id}>
                  <td>
                    <strong>{t.title}</strong>
                    {t.description && (
                      <div className="small" style={{ whiteSpace: 'pre-wrap' }}>
                        {t.description}
                      </div>
                    )}
                    {t.completionNote && <div className="small muted">Not: {t.completionNote}</div>}
                    {!isAdmin && t.createdByName && <div className="small muted">Atayan: {t.createdByName}</div>}
                  </td>
                  {isAdmin && <td className="small">{t.assignee.fullName}</td>}
                  <td className="nowrap">{formatDay(t.dueDate)}</td>
                  <td>
                    {dueBadge(t)}
                    {t.completedAt && <div className="small muted">{formatDate(t.completedAt)}</div>}
                  </td>
                  <td className="nowrap">
                    {t.status === 'open' && (
                      <div className="actions">
                        <button className="btn btn-small btn-primary" onClick={() => setClosing({ task: t, action: 'complete' })}>
                          Tamamla
                        </button>
                        {isAdmin && (
                          <button className="btn btn-small btn-danger" onClick={() => setClosing({ task: t, action: 'cancel' })}>
                            İptal et
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {isAdmin && (
        <Modal open={creating} onClose={() => setCreating(false)} title="Eğitmene görev ata">
          <NewTaskForm
            onDone={() => {
              setCreating(false);
              setTab('open');
              list.reload();
            }}
          />
        </Modal>
      )}
      <Modal open={!!closing} onClose={() => setClosing(null)} title={closing?.action === 'cancel' ? 'Görevi iptal et' : 'Görevi tamamla'}>
        {closing && (
          <CloseForm
            task={closing.task}
            action={closing.action}
            onDone={() => {
              setClosing(null);
              list.reload();
              window.dispatchEvent(new Event('kvkk:notifications'));
            }}
          />
        )}
      </Modal>
    </>
  );
}

function NewTaskForm({ onDone }: { onDone: () => void }) {
  const trainers = useApi<{ items: Trainer[] }>('training-admin/trainers');
  const active = (trainers.data?.items ?? []).filter((t) => t.isActive);
  const [assigneeId, setAssigneeId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [reminderDays, setReminderDays] = useState<number[]>(DEFAULT_REMINDER_DAYS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleReminder = (d: number) => setReminderDays((r) => (r.includes(d) ? r.filter((x) => x !== d) : [...r, d]));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('training-admin/trainer-tasks', {
        method: 'POST',
        body: { assigneeId, title, description: description || null, dueDate, reminderDays },
      });
      onDone();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  if (trainers.loading && !trainers.data) return <Loading />;
  return (
    <form className="form" onSubmit={submit}>
      <ErrorAlert error={error ?? trainers.error} />
      <Field label="Eğitmen" htmlFor="tt-assignee" required>
        <select id="tt-assignee" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} required>
          <option value="">Seçin</option>
          {active.map((t) => (
            <option key={t.id} value={t.userId}>
              {t.firstName} {t.lastName}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Görev" htmlFor="tt-title" required>
        <input id="tt-title" value={title} onChange={(e) => setTitle(e.target.value)} minLength={2} maxLength={200} required />
      </Field>
      <Field label="Son tarih" htmlFor="tt-due" required>
        <input id="tt-due" type="date" min={todayIso()} value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
      </Field>
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
      <Field label="Açıklama" htmlFor="tt-description">
        <textarea id="tt-description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={5000} />
      </Field>
      <div className="actions">
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Kaydediliyor…' : 'Görevi ata'}
        </button>
      </div>
    </form>
  );
}

function CloseForm({ task, action, onDone }: { task: TrainerTask; action: 'complete' | 'cancel'; onDone: () => void }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`training-admin/trainer-tasks/${task.id}/${action}`, { method: 'POST', body: { note: note || null } });
      onDone();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <p>{task.title}</p>
      <ErrorAlert error={error} />
      <Field label="Not" htmlFor="tt-note">
        <textarea id="tt-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
      </Field>
      <div className="actions">
        <button className={`btn ${action === 'cancel' ? 'btn-danger' : 'btn-primary'}`} disabled={busy}>
          {busy ? 'Kaydediliyor…' : action === 'cancel' ? 'İptal et' : 'Tamamlandı olarak kaydet'}
        </button>
      </div>
    </form>
  );
}
