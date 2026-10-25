'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { EmployeePicker } from '@/components/employee-picker';
import { ExportButton } from '@/components/export-button';
import { RESULT_EXPORT_COLUMNS, ResultsTable } from '@/components/results-table';
import { TrainerSelect } from '@/components/trainer-select';
import { Alert, ErrorAlert, Field, Loading, Modal, PageHeader, Stat } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { formatDateTime } from '@/lib/labels';
import type { PickableEmployee, Trainer, TrainingGroupDetail, TrainingResult } from '@/lib/types';
import { useApi } from '@/lib/use-api';

/** Eğitim grubu: katılımcılar, eğitimi başlatma (gönderme) ve sonuçlar. */
export default function GroupPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const group = useApi<TrainingGroupDetail>(`training-admin/groups/${id}`);
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const employees = useApi<{ items: PickableEmployee[] }>(
    adding && group.data ? `training-admin/organizations/${group.data.organizationId}/employees` : null,
  );
  const [editing, setEditing] = useState<{ name: string; trainerId: string } | null>(null);
  const trainers = useApi<{ items: Trainer[] }>(editing ? 'training-admin/trainers' : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: 'success' | 'warning'; text: string } | null>(null);

  if (group.loading && !group.data) return <Loading />;
  if (!group.data) return <ErrorAlert error={group.error} />;
  const g = group.data;
  // E-postası olmayan çalışana gönderilemez; düğme yalnızca gönderilebilecekleri sayar.
  const unsent = g.participants.filter((p) => !p.sentAt && p.email && p.phone);

  async function run<T>(fn: () => Promise<T>) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      return await fn();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function send(participantIds?: string[]) {
    const who = participantIds ? 'Seçilen katılımcıya' : `${unsent.length} katılımcıya`;
    if (!confirm(`${who} eğitim bağlantısı ve giriş bilgileri e-postayla gönderilsin mi?`)) return;
    const r = await run(() =>
      api<{ sent: number; skipped: { name: string; reason: string }[] }>(`training-admin/groups/${id}/send`, {
        method: 'POST',
        body: participantIds ? { participantIds } : {},
      }),
    );
    if (!r) return;
    const skipped = r.skipped.map((s) => `${s.name} (${s.reason})`).join(', ');
    setMessage({
      kind: r.skipped.length ? 'warning' : 'success',
      text: `${r.sent} katılımcıya gönderildi.${skipped ? ` Gönderilemeyenler: ${skipped}.` : ''}`,
    });
    await group.reload();
  }

  async function addParticipants() {
    const ok = await run(() => api(`training-admin/groups/${id}/participants`, { method: 'POST', body: { employeeIds: selected } }));
    if (ok === undefined) return;
    setAdding(false);
    setSelected([]);
    await group.reload();
  }

  async function removeParticipant(r: TrainingResult) {
    if (!confirm(`${r.fullName} gruptan çıkarılsın mı?`)) return;
    await run(() => api(`training-admin/groups/${id}/participants/${r.id}`, { method: 'DELETE' }));
    await group.reload();
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const ok = await run(() => api(`training-admin/groups/${id}`, { method: 'PATCH', body: editing }).then(() => true));
    if (!ok) return;
    setEditing(null);
    await group.reload();
  }

  async function remove() {
    if (!confirm(`"${g.name}" grubu silinsin mi?`)) return;
    const ok = await run(() => api(`training-admin/groups/${id}`, { method: 'DELETE' }).then(() => true));
    if (ok) router.push('/admin/egitim/gruplar');
  }

  return (
    <>
      <p className="small">
        <Link href="/admin/egitim/gruplar">← Eğitim grupları</Link>
      </p>
      <PageHeader
        title={g.name}
        description={
          <>
            {g.organizationName} · {g.trainingName} · Eğitimci: {g.trainerName ?? 'seçilmedi'} ·{' '}
            {g.assignedAt ? `Eğitim atama tarihi: ${formatDateTime(g.assignedAt)}` : 'Eğitim henüz başlatılmadı'}
          </>
        }
        actions={
          <>
            {unsent.length > 0 && (
              <button className="btn btn-primary" disabled={busy} onClick={() => send()}>
                {g.assignedAt ? `Yeni katılımcılara gönder (${unsent.length})` : `Eğitimi başlat (${unsent.length} kişi)`}
              </button>
            )}
            <button className="btn" onClick={() => setAdding(true)}>
              + Katılımcı ekle
            </button>
            <button className="btn" onClick={() => setEditing({ name: g.name, trainerId: g.trainerId ?? '' })}>
              Düzenle
            </button>
            {!g.assignedAt && (
              <button className="btn btn-danger" onClick={remove}>
                Grubu sil
              </button>
            )}
          </>
        }
      />
      <ErrorAlert error={group.error ?? error} />
      {message && <Alert kind={message.kind}>{message.text}</Alert>}
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <Stat label="Katılımcı" value={g.participantCount} />
        <Stat label="Eğitim gönderilen" value={g.sentCount} tone={g.sentCount < g.participantCount ? 'warn' : undefined} />
        <Stat label="Başlayan" value={g.participants.filter((p) => p.startedAt).length} />
        <Stat label="Başarıyla tamamlayan" value={g.completedCount} />
      </div>
      <div className="card" style={{ padding: 0 }}>
        <div className="card-header" style={{ padding: '16px 16px 0' }}>
          <h2>Katılımcılar ve sonuçlar</h2>
          <ExportButton fileName={`${g.name} - Sonuçlar`} rows={g.participants} columns={RESULT_EXPORT_COLUMNS} />
        </div>
        <ResultsTable
          rows={g.participants}
          showGroup={false}
          actions={(r) =>
            !r.sentAt ? (
              <button className="btn btn-small btn-danger" disabled={busy} onClick={() => removeParticipant(r)}>
                Çıkar
              </button>
            ) : (
              !r.completedAt && (
                <button className="btn btn-small" disabled={busy || !r.email || !r.phone} onClick={() => send([r.id])}>
                  Yeniden gönder
                </button>
              )
            )
          }
        />
      </div>
      <Modal open={editing !== null} onClose={() => setEditing(null)} title="Eğitim grubunu düzenle">
        {editing && (
          <form className="form" onSubmit={saveEdit}>
            <ErrorAlert error={error ?? trainers.error} />
            <Field label="Grup adı" required htmlFor="e-name">
              <input id="e-name" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} required />
            </Field>
            <TrainerSelect trainers={trainers.data?.items} value={editing.trainerId} onChange={(trainerId) => setEditing({ ...editing, trainerId })} />
            <div className="dialog-actions">
              <button type="button" className="btn" onClick={() => setEditing(null)}>
                Vazgeç
              </button>
              <button className="btn btn-primary" disabled={busy || !editing.trainerId}>
                Kaydet
              </button>
            </div>
          </form>
        )}
      </Modal>
      <Modal open={adding} onClose={() => setAdding(false)} title="Katılımcı ekle">
        {employees.loading && !employees.data ? (
          <Loading />
        ) : (
          <EmployeePicker
            employees={employees.data?.items ?? []}
            selected={selected}
            onChange={setSelected}
            exclude={g.participants.map((p) => p.employeeId)}
          />
        )}
        <div className="dialog-actions">
          <button className="btn" onClick={() => setAdding(false)}>
            Vazgeç
          </button>
          <button className="btn btn-primary" disabled={busy || selected.length === 0} onClick={addParticipants}>
            Ekle
          </button>
        </div>
      </Modal>
    </>
  );
}
