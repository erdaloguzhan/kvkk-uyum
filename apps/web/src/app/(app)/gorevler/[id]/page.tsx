'use client';

import { PERMISSIONS, TASK_ENTITY_TYPES, TASK_RECURRENCES, TASK_TYPES } from '@kvkk/shared';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { dueBadge, entityHref } from '@/components/task-list';
import { Alert, ErrorAlert, Field, Loading, PageHeader } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { formatDateTime, formatDay } from '@/lib/labels';
import { useSession } from '@/lib/session';
import type { Task } from '@/lib/types';
import { useApi } from '@/lib/use-api';

export default function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { me, can } = useSession();
  const task = useApi<Task>(`tasks/${id}`);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (task.loading && !task.data) return <Loading />;
  if (!task.data) return <ErrorAlert error={task.error} />;
  const t = task.data;
  const canManage = can(PERMISSIONS.TASKS_MANAGE);
  const canComplete = t.status === 'open' && t.type !== 'approval' && (t.assignee.id === me?.id || canManage);
  const link = entityHref(t);

  async function act(fn: () => Promise<string>) {
    setBusy(true);
    setError(null);
    try {
      setMessage(await fn());
      await task.reload();
      window.dispatchEvent(new Event('kvkk:notifications'));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <p className="small">
        <Link href="/gorevler">← Görevler</Link>
      </p>
      <PageHeader title={t.title} description={TASK_TYPES[t.type]} actions={dueBadge(t)} />
      <ErrorAlert error={error} />
      {message && <Alert kind="success">{message}</Alert>}
      <div className="card">
        <dl className="details">
          <dt>Atanan kişi</dt>
          <dd>{t.assignee.fullName}</dd>
          <dt>Son tarih</dt>
          <dd>{formatDay(t.dueDate)}</dd>
          <dt>Hatırlatma</dt>
          <dd>
            {t.reminderDays.length
              ? t.reminderDays.map((d) => (d === 0 ? 'son gün' : `${d} gün önce`)).join(', ')
              : 'Yok'}
          </dd>
          <dt>Tekrarlama</dt>
          <dd>{TASK_RECURRENCES.find((r) => r.months === t.recurrenceMonths)?.label ?? 'Tek seferlik'}</dd>
          {link && t.entityType && (
            <>
              <dt>Bağlı kayıt</dt>
              <dd>
                <Link href={link}>{TASK_ENTITY_TYPES[t.entityType]} kaydını aç →</Link>
              </dd>
            </>
          )}
          {t.description && (
            <>
              <dt>Açıklama</dt>
              <dd style={{ whiteSpace: 'pre-wrap' }}>{t.description}</dd>
            </>
          )}
          {t.completedAt && (
            <>
              <dt>Tamamlanma</dt>
              <dd>
                {formatDateTime(t.completedAt)}
                {t.completionNote && <div className="small">Not: {t.completionNote}</div>}
              </dd>
            </>
          )}
        </dl>
      </div>

      {t.type === 'approval' && t.status === 'open' && link && (
        <Alert kind="info">
          Bu bir onay görevidir. <Link href={link}>Dokümanı açıp</Link> sürümü onaylayın veya reddedin; görev kendiliğinden kapanır.
        </Alert>
      )}

      {canComplete && (
        <div className="card">
          <h2>Görevi tamamla</h2>
          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              act(async () => {
                await api(`tasks/${t.id}/complete`, { method: 'POST', body: { note: note.trim() || null } });
                return t.recurrenceMonths
                  ? 'Görev tamamlandı. Sonraki dönemin görevi oluşturuldu.'
                  : 'Görev tamamlandı.';
              });
            }}
          >
            <Field label="Not" htmlFor="note" hint="Ne yapıldığını kısaca yazabilirsiniz.">
              <textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
            </Field>
            <div className="actions">
              <button className="btn btn-primary" disabled={busy}>
                Tamamlandı olarak işaretle
              </button>
              {canManage && (
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={busy}
                  onClick={() => {
                    if (!confirm('Görev iptal edilsin mi?')) return;
                    act(async () => {
                      await api(`tasks/${t.id}/cancel`, { method: 'POST' });
                      return 'Görev iptal edildi.';
                    });
                  }}
                >
                  Görevi iptal et
                </button>
              )}
            </div>
          </form>
        </div>
      )}
    </>
  );
}
