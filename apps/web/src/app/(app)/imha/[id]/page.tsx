'use client';

import { PERMISSIONS } from '@kvkk/shared';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { ApproverDialog, NoteDialog } from '@/components/approval-dialogs';
import {
  CompleteDialog,
  DestructionTabs,
  ItemDialog,
  itemStatusBadge,
  mediumLabel,
  operationLabel,
  planStatusBadge,
} from '@/components/destruction';
import { ExportButton } from '@/components/export-button';
import { Alert, Empty, ErrorAlert, Field, Loading, Modal, PageHeader } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { formatDateTime, formatDay } from '@/lib/labels';
import { useSession } from '@/lib/session';
import type { DestructionItem, DestructionPlan } from '@/lib/types';
import { useApi } from '@/lib/use-api';

type Dialog =
  | { kind: 'submit' | 'approve' | 'reject' | 'edit-plan' | 'add' }
  | { kind: 'edit' | 'complete' | 'cancel'; item: DestructionItem };

/** İmha planı: dönem, Yönetici onayı ve plandaki imha işleri. */
export default function DestructionPlanPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { me, can } = useSession();
  const canManage = can(PERMISSIONS.DESTRUCTION_MANAGE);
  const plan = useApi<DestructionPlan>(`destruction/plans/${id}`);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (plan.loading && !plan.data) return <Loading />;
  if (!plan.data) return <ErrorAlert error={plan.error} />;
  const p = plan.data;
  const pending = p.status === 'pending';
  const editable = canManage && !pending;
  const canDecide = pending && p.approver?.id === me?.id && can(PERMISSIONS.DESTRUCTION_APPROVE);
  const planned = p.items.filter((i) => i.status === 'planned');

  async function act(path: string, opts: { method?: string; body?: unknown }, done: string | null) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await api(path, { method: opts.method ?? 'POST', body: opts.body });
      setDialog(null);
      if (done) setMessage(done);
      await plan.reload();
      window.dispatchEvent(new Event('kvkk:notifications'));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function nextPlan() {
    if (!confirm('Bir sonraki dönemin planı bu planın işleri kopyalanarak açılsın mı?')) return;
    setBusy(true);
    try {
      const next = await api<DestructionPlan>(`destruction/plans/${id}/next`, { method: 'POST', body: {} });
      router.push(`/imha/${next.id}`);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  async function deletePlan() {
    if (!confirm('İmha planı silinsin mi?')) return;
    try {
      await api(`destruction/plans/${id}`, { method: 'DELETE' });
      router.push('/imha');
    } catch (err) {
      setError(errorText(err));
    }
  }

  const done = () => {
    setDialog(null);
    plan.reload();
  };

  return (
    <>
      <PageHeader
        title={p.title}
        description={
          <>
            {formatDay(p.periodStart)} – {formatDay(p.periodEnd)} · {planStatusBadge(p.status)}
          </>
        }
        actions={
          <>
            {canDecide && (
              <>
                <button className="btn btn-primary" onClick={() => setDialog({ kind: 'approve' })} disabled={busy}>
                  Onayla
                </button>
                <button className="btn btn-danger" onClick={() => setDialog({ kind: 'reject' })} disabled={busy}>
                  Reddet
                </button>
              </>
            )}
            {editable && p.status !== 'approved' && (
              <button className="btn btn-primary" onClick={() => setDialog({ kind: 'submit' })} disabled={busy || planned.length === 0}>
                Onaya gönder
              </button>
            )}
            {canManage && pending && (
              <button
                className="btn"
                disabled={busy}
                onClick={() => confirm('Onay talebi geri çekilsin mi?') && act(`destruction/plans/${id}/withdraw`, {}, 'Onay talebi geri çekildi.')}
              >
                Onay talebini geri çek
              </button>
            )}
          </>
        }
      />
      <DestructionTabs />
      <p className="small">
        <Link href="/imha">← İmha planları</Link>
      </p>
      <ErrorAlert error={error} />
      {message && <Alert kind="success">{message}</Alert>}
      {p.status === 'draft' && p.decidedAt && (
        <Alert kind="info">Plan son karardan sonra değiştirildi. Değişikliklerin geçerli olması için yeniden onaya gönderin.</Alert>
      )}

      <div className="card">
        <dl className="details">
          <dt>Durum</dt>
          <dd>{planStatusBadge(p.status)}</dd>
          {p.description && (
            <>
              <dt>Açıklama</dt>
              <dd style={{ whiteSpace: 'pre-wrap' }}>{p.description}</dd>
            </>
          )}
          {p.approver && (
            <>
              <dt>Onaylayacak kişi</dt>
              <dd>
                {p.approver.fullName}
                {pending && p.approvalDueDate && <span className="muted"> · son tarih {formatDay(p.approvalDueDate)}</span>}
              </dd>
              <dt>Gönderen</dt>
              <dd>
                {p.requestedBy?.fullName ?? '—'} · {formatDateTime(p.requestedAt)}
                {p.requestNote && <div style={{ whiteSpace: 'pre-wrap' }}>{p.requestNote}</div>}
              </dd>
            </>
          )}
          {p.decidedAt && (
            <>
              <dt>Karar</dt>
              <dd>
                {p.decidedBy?.fullName ?? '—'} · {formatDateTime(p.decidedAt)}
                {p.decisionNote && <div style={{ whiteSpace: 'pre-wrap' }}>{p.decisionNote}</div>}
              </dd>
            </>
          )}
        </dl>
        {canManage && (
          <div className="actions" style={{ marginTop: 16 }}>
            {editable && (
              <button className="btn" onClick={() => setDialog({ kind: 'edit-plan' })}>
                Plan bilgilerini düzenle
              </button>
            )}
            <button className="btn" onClick={nextPlan} disabled={busy}>
              Sonraki dönem planını oluştur
            </button>
            {editable && !p.items.some((i) => i.status === 'done') && (
              <button className="btn btn-danger" onClick={deletePlan}>
                Planı sil
              </button>
            )}
          </div>
        )}
      </div>

      <div className="page-header" style={{ marginTop: 24 }}>
        <div>
          <h2>Planlanan imhalar</h2>
          <p className="small muted">
            Veriler, kayıt ortamları ve saklama süreleri veri envanterinden gelir. Saklama süresi dolmayan satırları iptal edin veya silin.
          </p>
        </div>
        <div className="actions">
          <ExportButton
            fileName={`imha-plani-${p.periodStart}`}
            rows={p.items}
            columns={[
              { label: 'İmha edilecek veri', value: (i) => i.dataDescription },
              { label: 'Kayıt ortamı', value: (i) => mediumLabel(i.storageMedium) },
              { label: 'Saklama süresi', value: (i) => i.retentionPeriod },
              { label: 'Planlanan imha tarihi', value: (i) => formatDay(i.plannedDate) },
              { label: 'İşlem türü', value: (i) => operationLabel(i.operationType) },
              { label: 'Planlanan yöntem', value: (i) => i.method },
              { label: 'İmha sorumlusu', value: (i) => i.officerName },
              { label: 'Durum', value: (i) => (i.status === 'done' ? 'Gerçekleşti' : i.status === 'cancelled' ? 'İptal edildi' : 'Planlandı') },
              { label: 'Gerçekleşme tarihi', value: (i) => (i.record ? formatDay(i.record.performedDate) : '') },
              { label: 'Yapılan işlem', value: (i) => i.record?.performedNote ?? i.cancelReason },
            ]}
          />
          {editable && (
            <>
              <button
                className="btn"
                disabled={busy}
                onClick={() => act(`destruction/plans/${id}/items/from-inventory`, { body: {} }, null)}
                title="Plana henüz eklenmemiş envanter satırlarını ekler"
              >
                Envanterden ekle
              </button>
              <button className="btn btn-primary" onClick={() => setDialog({ kind: 'add' })}>
                + İmha işi ekle
              </button>
            </>
          )}
        </div>
      </div>
      {p.items.length === 0 ? (
        <div className="card">
          <Empty title="Planda imha işi yok">
            {editable && 'Veri envanterinden ekleyin veya tek tek imha işi ekleyin.'}
          </Empty>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>İmha edilecek veri</th>
                <th>Kayıt ortamı</th>
                <th>Saklama süresi</th>
                <th>Planlanan tarih</th>
                <th>İşlem türü</th>
                <th>İmha sorumlusu</th>
                <th>Durum</th>
                <th>Gerçekleşme</th>
                {canManage && <th />}
              </tr>
            </thead>
            <tbody>
              {p.items.map((i) => (
                <tr key={i.id}>
                  <td>
                    {i.dataDescription}
                    {i.method && <div className="small muted">{i.method}</div>}
                  </td>
                  <td className="nowrap">{mediumLabel(i.storageMedium)}</td>
                  <td className="small">{i.retentionPeriod ?? '—'}</td>
                  <td className="nowrap">{formatDay(i.plannedDate)}</td>
                  <td className="nowrap">{operationLabel(i.operationType)}</td>
                  <td>{i.officerName ?? <span className="muted">Atanmamış</span>}</td>
                  <td>{itemStatusBadge(i)}</td>
                  <td className="small">
                    {i.record ? (
                      <>
                        <div className="nowrap">{formatDay(i.record.performedDate)}</div>
                        <div>{i.record.performedNote}</div>
                      </>
                    ) : i.cancelReason ? (
                      <span className="muted">{i.cancelReason}</span>
                    ) : (
                      '—'
                    )}
                  </td>
                  {canManage && (
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, minWidth: 170 }}>
                        {i.status === 'planned' && !pending && (
                          <>
                            <button className="btn btn-small btn-primary" onClick={() => setDialog({ kind: 'complete', item: i })}>
                              Gerçekleşti
                            </button>
                            <button className="btn btn-small" onClick={() => setDialog({ kind: 'edit', item: i })}>
                              Düzenle
                            </button>
                            <button className="btn btn-small" onClick={() => setDialog({ kind: 'cancel', item: i })}>
                              İptal
                            </button>
                          </>
                        )}
                        {i.status !== 'done' && !pending && (
                          <button
                            className="btn btn-small btn-danger"
                            onClick={() => confirm('İmha işi plandan silinsin mi?') && act(`destruction/items/${i.id}`, { method: 'DELETE' }, null)}
                          >
                            Sil
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {dialog?.kind === 'submit' && (
        <ApproverDialog
          title="İmha planını onaya gönder"
          permission={PERMISSIONS.DESTRUCTION_APPROVE}
          hint="Onaylayan kişiye görev ve bildirim gider. Onaydan sonra her imha işi için hatırlatma görevi açılır."
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(body) => act(`destruction/plans/${id}/submit`, { body }, 'Plan onaya gönderildi.')}
        />
      )}
      {dialog?.kind === 'approve' && (
        <NoteDialog
          title="İmha planını onayla"
          text="Onaydan sonra her imha işi için planlanan tarihte son günü olan hatırlatma görevi açılır."
          submitLabel="Onayla"
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(note) => act(`destruction/plans/${id}/approve`, { body: { note: note || null } }, 'İmha planı onaylandı.')}
        />
      )}
      {dialog?.kind === 'reject' && (
        <NoteDialog
          title="İmha planını reddet"
          text="Ret gerekçesi planı gönderen kişiye iletilir."
          submitLabel="Reddet"
          required
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(note) => act(`destruction/plans/${id}/reject`, { body: { note } }, 'Plan reddedildi.')}
        />
      )}
      {dialog?.kind === 'cancel' && (
        <NoteDialog
          title="İmha işini iptal et"
          text={`${dialog.item.dataDescription} için imha yapılmayacak. Gerekçe kayıtta saklanır (ör. saklama süresi dolmadı).`}
          submitLabel="İptal et"
          required
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(reason) => act(`destruction/items/${dialog.item.id}/cancel`, { body: { reason } }, null)}
        />
      )}
      {(dialog?.kind === 'add' || dialog?.kind === 'edit') && (
        <ItemDialog
          planId={id}
          item={dialog.kind === 'edit' ? dialog.item : undefined}
          defaultDate={p.periodEnd}
          onClose={() => setDialog(null)}
          onSaved={done}
        />
      )}
      {dialog?.kind === 'complete' && <CompleteDialog item={dialog.item} onClose={() => setDialog(null)} onSaved={done} />}
      {dialog?.kind === 'edit-plan' && <EditPlanDialog plan={p} onClose={() => setDialog(null)} onSaved={done} />}
    </>
  );
}

function EditPlanDialog({ plan, onClose, onSaved }: { plan: DestructionPlan; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(plan.title);
  const [periodStart, setPeriodStart] = useState(plan.periodStart);
  const [periodEnd, setPeriodEnd] = useState(plan.periodEnd);
  const [description, setDescription] = useState(plan.description ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`destruction/plans/${plan.id}`, {
        method: 'PATCH',
        body: { title: title.trim(), periodStart, periodEnd, description: description.trim() || null },
      });
      onSaved();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Plan bilgileri">
      <form className="form" onSubmit={save}>
        <ErrorAlert error={error} />
        <Field label="Plan adı" htmlFor="ep-title" required>
          <input id="ep-title" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} />
        </Field>
        <div className="form-row">
          <Field label="Dönem başlangıcı" htmlFor="ep-start" required>
            <input id="ep-start" type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} required />
          </Field>
          <Field label="Dönem bitişi" htmlFor="ep-end" required>
            <input id="ep-end" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} required />
          </Field>
        </div>
        <Field label="Açıklama" htmlFor="ep-desc">
          <textarea id="ep-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={5000} />
        </Field>
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>
            Vazgeç
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
