'use client';

import { INCIDENT_NOTIFICATION_TYPES, INCIDENT_NOTIFY_DEADLINE_HOURS, PERMISSIONS } from '@kvkk/shared';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { ApproverDialog, NoteDialog } from '@/components/approval-dialogs';
import { IncidentFormFields, incidentValues, toIncidentPayload, toLocalInput } from '@/components/incident-form';
import { deadlineBadge, incidentStatusBadge } from '@/components/incident-status';
import { Alert, ErrorAlert, Field, Loading, Modal, PageHeader } from '@/components/ui';
import { api, download, errorText } from '@/lib/api';
import { formatDateTime } from '@/lib/labels';
import { useSession } from '@/lib/session';
import type { IncidentDetail } from '@/lib/types';
import { useApi } from '@/lib/use-api';

type DialogKind = 'submit' | 'approve' | 'reject' | 'notified' | 'close' | null;

export default function IncidentPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { me, can } = useSession();
  const canManage = can(PERMISSIONS.INCIDENTS_MANAGE);
  const canApprove = can(PERMISSIONS.INCIDENTS_APPROVE);
  const incident = useApi<IncidentDetail>(`incidents/${id}`);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (incident.loading && !incident.data) return <Loading />;
  if (!incident.data) return <ErrorAlert error={incident.error} />;
  const i = incident.data;
  const editable = i.status === 'draft' && canManage;
  const canDecide = i.status === 'pending_approval' && i.approverId === me?.id && canApprove;
  const canClose = canManage || canApprove;

  async function act(path: string, body: object | undefined, done: string) {
    setBusy(true);
    setError(null);
    try {
      const updated = await api<IncidentDetail>(`incidents/${id}/${path}`, { method: 'POST', body });
      setDialog(null);
      setMessage(done);
      if (updated.id !== id) router.push(`/ihlaller/${updated.id}`);
      else incident.setData(updated);
      window.dispatchEvent(new Event('kvkk:notifications'));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      // Pencere kapanır ki hata (ör. onaya göndermeden önce eksik alanlar) sayfanın üstünde görünsün.
      setDialog(null);
      setError(errorText(err));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setBusy(false);
    }
  }

  async function downloadForm() {
    setError(null);
    try {
      await download(`incidents/${id}/form.docx`, `FRM-020 Veri İhlal Bildirim Formu - İhlal ${i.number}.docx`);
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function remove() {
    if (!confirm(`İhlal #${i.number} kaydı silinsin mi? Bu işlem geri alınamaz.`)) return;
    try {
      await api(`incidents/${id}`, { method: 'DELETE' });
      router.push('/ihlaller');
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <>
      <p className="small">
        <Link href="/ihlaller">← Veri ihlalleri</Link>
      </p>
      <PageHeader
        title={`İhlal #${i.number}: ${i.title}`}
        description={
          <>
            {INCIDENT_NOTIFICATION_TYPES[i.notificationType]} · {incidentStatusBadge(i.status)} {deadlineBadge(i)}
          </>
        }
        actions={
          <>
            <button className="btn" onClick={downloadForm}>
              Bildirim formunu indir (Word)
            </button>
            {editable && (
              <button className="btn btn-primary" onClick={() => setDialog('submit')} disabled={busy}>
                Onaya gönder
              </button>
            )}
            {canDecide && (
              <>
                <button className="btn btn-primary" onClick={() => setDialog('approve')} disabled={busy}>
                  Onayla
                </button>
                <button className="btn btn-danger" onClick={() => setDialog('reject')} disabled={busy}>
                  Geri çevir
                </button>
              </>
            )}
            {i.status === 'pending_approval' && canManage && (
              <button
                className="btn"
                disabled={busy}
                onClick={() => confirm('Kayıt onaydan geri çekilip düzenlemeye açılsın mı?') && act('withdraw', undefined, 'Kayıt onaydan geri çekildi.')}
              >
                Onaydan geri çek
              </button>
            )}
            {i.status === 'approved' && canClose && (
              <button className="btn btn-primary" onClick={() => setDialog('notified')} disabled={busy}>
                Kurula bildirildi
              </button>
            )}
            {i.status === 'notified' && canManage && (
              <button className="btn" onClick={() => act('follow-up', undefined, 'Takip bildirimi oluşturuldu.')} disabled={busy}>
                Takip bildirimi oluştur
              </button>
            )}
          </>
        }
      />
      <ErrorAlert error={error} />
      {message && <Alert kind="success">{message}</Alert>}
      {i.overdue && (
        <Alert kind="error">
          Kurula bildirim için {INCIDENT_NOTIFY_DEADLINE_HOURS} saatlik süre {formatDateTime(i.deadlineAt)} tarihinde doldu. Bildirimi bir an
          önce yapın; formdaki gecikme sebebi sorusunu doldurmanız gerekir.
        </Alert>
      )}
      {i.status === 'approved' && (
        <Alert kind="info">
          Bildirim formu onaylandı. Formu indirip <strong>ihlalbildirimi@kvkk.gov.tr</strong> adresine “Kişisel veri ihlali bildirimi”
          konulu bir e-posta ekiyle gönderin, ardından “Kurula bildirildi” ile kaydı kapatın.
        </Alert>
      )}
      {i.status === 'draft' && i.decision === 'rejected' && i.decisionNote && (
        <Alert kind="warning">
          Yönetici geri çevirdi{i.decidedByUser ? ` (${i.decidedByUser.fullName})` : ''}: {i.decisionNote}
        </Alert>
      )}

      <div className="card">
        <dl className="details">
          <dt>Tespit</dt>
          <dd>{formatDateTime(i.detectedAt)}</dd>
          {i.deadlineAt && (
            <>
              <dt>Kurula bildirim son süresi</dt>
              <dd>
                {formatDateTime(i.deadlineAt)} <span className="muted small">(tespitten itibaren {INCIDENT_NOTIFY_DEADLINE_HOURS} saat)</span>
              </dd>
            </>
          )}
          <dt>Kaydı açan</dt>
          <dd>
            {i.createdByUser?.fullName ?? '—'} · {formatDateTime(i.createdAt)}
          </dd>
          {i.approver && (
            <>
              <dt>Onaylayacak kişi</dt>
              <dd>
                {i.approver.fullName}
                {i.submittedAt && <span className="muted small"> · onaya gönderildi {formatDateTime(i.submittedAt)}</span>}
              </dd>
            </>
          )}
          {i.decision === 'approved' && i.decidedAt && (
            <>
              <dt>Onay</dt>
              <dd>
                {i.decidedByUser?.fullName ?? '—'} · {formatDateTime(i.decidedAt)}
                {i.decisionNote && <div style={{ whiteSpace: 'pre-wrap' }}>{i.decisionNote}</div>}
              </dd>
            </>
          )}
          {i.notifiedAt && (
            <>
              <dt>Kurula bildirim</dt>
              <dd>{formatDateTime(i.notifiedAt)}</dd>
            </>
          )}
          {i.status === 'closed' && (
            <>
              <dt>Kapanış</dt>
              <dd>Bildirim gerekmedi · {formatDateTime(i.closedAt)}</dd>
            </>
          )}
          {i.closingNote && (
            <>
              <dt>{i.status === 'closed' ? 'Gerekçe' : 'Not'}</dt>
              <dd style={{ whiteSpace: 'pre-wrap' }}>{i.closingNote}</dd>
            </>
          )}
          {i.parent && (
            <>
              <dt>İlk bildirim</dt>
              <dd>
                <Link href={`/ihlaller/${i.parent.id}`}>
                  İhlal #{i.parent.number}: {i.parent.title}
                </Link>
              </dd>
            </>
          )}
          {i.followUps.length > 0 && (
            <>
              <dt>{i.parent ? 'Diğer bildirimler' : 'Takip bildirimleri'}</dt>
              <dd>
                {i.followUps.map((f) => (
                  <div key={f.id}>
                    <Link href={`/ihlaller/${f.id}`}>
                      İhlal #{f.number} ({INCIDENT_NOTIFICATION_TYPES[f.notificationType]})
                    </Link>{' '}
                    {incidentStatusBadge(f.status)}
                  </div>
                ))}
              </dd>
            </>
          )}
        </dl>
        {(editable || ((i.status === 'draft' || i.status === 'approved') && canClose)) && (
          <div className="actions" style={{ marginTop: 14 }}>
            {(i.status === 'draft' || i.status === 'approved') && canClose && (
              <button className="btn" onClick={() => setDialog('close')} disabled={busy}>
                Bildirim gerekmedi olarak kapat
              </button>
            )}
            {editable && (
              <button className="btn btn-danger" onClick={remove} disabled={busy}>
                Kaydı sil
              </button>
            )}
          </div>
        )}
      </div>

      {!editable && i.status !== 'draft' && (
        <p className="small muted">
          {i.status === 'pending_approval'
            ? 'Kayıt onay beklediği için değiştirilemez. Değiştirmek için onaydan geri çekin.'
            : 'Bu kayıt artık değiştirilemez. Yeni bilgiler için takip bildirimi oluşturun.'}
        </p>
      )}
      <IncidentFormFields
        key={i.updatedAt}
        initial={incidentValues(i)}
        notificationType={i.notificationType}
        readOnly={!editable}
        submitLabel="Değişiklikleri kaydet"
        onSubmit={async (values) => {
          const updated = await api<IncidentDetail>(`incidents/${id}`, { method: 'PATCH', body: toIncidentPayload(values) });
          incident.setData(updated);
          setMessage('Kaydedildi.');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />

      {dialog === 'submit' && (
        <ApproverDialog
          title="Bildirim formunu onaya gönder"
          permission={PERMISSIONS.INCIDENTS_APPROVE}
          hint="Yönetici formu onayladıktan sonra Kurula gönderilir."
          showDueDate={false}
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={({ approverId, note }) => act('submit', { approverId, note }, 'Kayıt Yöneticinin onayına gönderildi.')}
        />
      )}
      {dialog === 'approve' && (
        <NoteDialog
          title="Bildirim formunu onayla"
          text="Onaydan sonra form Kurula gönderilebilir. Kaydı açan kişiye bildirilir."
          submitLabel="Onayla"
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(note) => act('approve', { note: note || null }, 'Bildirim formu onaylandı.')}
        />
      )}
      {dialog === 'reject' && (
        <NoteDialog
          title="Bildirim formunu geri çevir"
          text="Gerekçe kaydı hazırlayan kişiye iletilir; kayıt düzeltilip yeniden onaya gönderilebilir."
          submitLabel="Geri çevir"
          required
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(note) => act('reject', { note }, 'Kayıt geri çevrildi.')}
        />
      )}
      {dialog === 'close' && (
        <NoteDialog
          title="Bildirim gerekmedi olarak kapat"
          text="Değerlendirme sonucunda Kurula bildirim yapılmayacaksa gerekçesini yazın (ör. risk değerlendirmesi). Kayıt saklanır, değiştirilemez."
          submitLabel="Kapat"
          required
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(note) => act('close', { note }, 'Kayıt kapatıldı.')}
        />
      )}
      {dialog === 'notified' && (
        <NotifiedDialog busy={busy} onClose={() => setDialog(null)} onSubmit={(body) => act('notified', body, 'Kayıt Kurula bildirildi olarak işaretlendi.')} />
      )}
    </>
  );
}

function NotifiedDialog({
  busy,
  onClose,
  onSubmit,
}: {
  busy: boolean;
  onClose: () => void;
  onSubmit: (body: { notifiedAt: string; note: string | null }) => void;
}) {
  const [at, setAt] = useState(() => toLocalInput(new Date().toISOString()));
  const [note, setNote] = useState('');
  return (
    <Modal open onClose={onClose} title="Kurula bildirildi">
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({ notifiedAt: new Date(at).toISOString(), note: note.trim() || null });
        }}
      >
        <Field label="Bildirim tarihi ve saati" htmlFor="notifiedAt" required hint="Formun Kurula gönderildiği an (e-posta veya posta).">
          <input id="notifiedAt" type="datetime-local" value={at} max={toLocalInput(new Date().toISOString())} onChange={(e) => setAt(e.target.value)} required />
        </Field>
        <Field label="Not" htmlFor="notified-note" hint="Ör. gönderilen e-posta adresi, Kurumun verdiği takip numarası.">
          <textarea id="notified-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
        </Field>
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>
            Vazgeç
          </button>
          <button className="btn btn-primary" disabled={busy || !at}>
            {busy ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
