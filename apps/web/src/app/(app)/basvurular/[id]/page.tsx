'use client';

import {
  DSR_ANSWER_METHODS,
  DSR_CHANNELS,
  DSR_EVENT_KINDS,
  DSR_OUTCOMES,
  DSR_RELATIONSHIPS,
  DSR_REQUEST_ITEMS,
  DSR_RESPONSE_METHOD_SHORT,
  DsrAnswerMethod,
  DsrOutcome,
  PERMISSIONS,
} from '@kvkk/shared';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { RequestFilesField, useRequestFiles } from '@/components/request-form';
import { requestStatusBadge } from '@/components/request-status';
import { Alert, ErrorAlert, Field, Loading, PageHeader } from '@/components/ui';
import { api, download, errorText } from '@/lib/api';
import { formatBytes, formatDateTime, formatDay, todayIso } from '@/lib/labels';
import { useSession } from '@/lib/session';
import type { DataSubjectRequestDetail, RequestFormSettings } from '@/lib/types';
import { useApi } from '@/lib/use-api';

const ITEMS = new Map(DSR_REQUEST_ITEMS.map((i) => [i.no, i]));
const FILE_KINDS = { applicant: 'Başvuranın belgesi', response: 'Cevap yazısı', other: 'Diğer' } as const;

export default function RequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useSession();
  const canManage = can(PERMISSIONS.REQUESTS_MANAGE);
  const req = useApi<DataSubjectRequestDetail>(`data-subject-requests/${id}`);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (req.loading && !req.data) return <Loading />;
  if (!req.data) return <ErrorAlert error={req.error} />;
  const r = req.data;
  const base = `data-subject-requests/${r.id}`;

  async function act(fn: () => Promise<DataSubjectRequestDetail>, done: string) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      req.setData(await fn());
      setMessage(done);
      window.dispatchEvent(new Event('kvkk:notifications'));
      return true;
    } catch (err) {
      setError(errorText(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function downloadFile(path: string, name: string) {
    try {
      await download(path, name);
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <>
      <p className="small">
        <Link href="/basvurular">← İlgili kişi başvuruları</Link>
      </p>
      <PageHeader
        title={`${r.code} · ${r.fullName}`}
        description={<>{requestStatusBadge(r)}</>}
        actions={
          <button type="button" className="btn" onClick={() => downloadFile(`${base}/pdf`, `${r.code} Veri Sahibi Başvuru Formu.pdf`)}>
            PDF indir
          </button>
        }
      />
      <ErrorAlert error={error} />
      {message && <Alert kind="success">{message}</Alert>}

      <div className="grid grid-2">
        <div className="card">
          <h2>Süreler</h2>
          <dl className="details">
            <dt>Başvuru tarihi</dt>
            <dd>
              {formatDateTime(r.receivedAt)} · {DSR_CHANNELS[r.channel]}
            </dd>
            <dt>Kurum içi hedef</dt>
            <dd>{formatDay(r.targetDate)}</dd>
            <dt>Yasal son gün</dt>
            <dd>{formatDay(r.legalDueDate)} (Kanun md. 13)</dd>
            {(r.pausedDays > 0 || r.pausedOn) && (
              <>
                <dt>Ek bilgi beklenen</dt>
                <dd>
                  {r.pausedDays} gün{r.pausedOn && <> · {formatDay(r.pausedOn)} tarihinden beri bekleniyor (süre durdu)</>}
                </dd>
              </>
            )}
            <dt>Sorumlu</dt>
            <dd>
              {r.task ? (
                <>
                  <Link href={`/gorevler/${r.task.id}`}>{r.task.assignee.fullName}</Link> · görev {r.task.status === 'open' ? 'açık' : 'kapandı'}
                </>
              ) : (
                <span className="muted">Atanmadı</span>
              )}
              {canManage && r.status !== 'answered' && (
                <AssigneePicker
                  current={r.task?.assignee.id ?? null}
                  busy={busy}
                  onPick={(assigneeId, name) =>
                    act(() => api(`${base}/assignee`, { method: 'POST', body: { assigneeId } }), `Başvuru ${name} kişisine atandı.`)
                  }
                />
              )}
            </dd>
            {r.status === 'answered' && (
              <>
                <dt>Cevap süresi</dt>
                <dd>{r.responseDays} gün</dd>
              </>
            )}
          </dl>
        </div>
        <div className="card">
          <h2>Veri sahibi</h2>
          <dl className="details">
            <dt>Ad soyad</dt>
            <dd>{r.fullName}</dd>
            <dt>T.C. kimlik no</dt>
            <dd>{r.nationalId ?? '—'}</dd>
            <dt>Doğum tarihi</dt>
            <dd>{formatDay(r.birthDate)}</dd>
            <dt>Cep telefonu</dt>
            <dd>{r.phone ? <a href={`tel:${r.phone}`}>{r.phone}</a> : '—'}</dd>
            <dt>E-posta</dt>
            <dd>{r.email ? <a href={`mailto:${r.email}`}>{r.email}</a> : '—'}</dd>
            <dt>Adres</dt>
            <dd style={{ whiteSpace: 'pre-wrap' }}>{r.address ?? '—'}</dd>
            <dt>İlişkisi</dt>
            <dd>
              {r.relationship ? DSR_RELATIONSHIPS[r.relationship].label : '—'}
              {r.relationshipDetail && ` (${r.relationshipDetail})`}
            </dd>
            <dt>Yanıt yöntemi</dt>
            <dd>{r.responseMethod ? DSR_RESPONSE_METHOD_SHORT[r.responseMethod] : '—'}</dd>
            {r.channel !== 'web_form' && r.createdBy && (
              <>
                <dt>Kaydeden</dt>
                <dd>{r.createdBy.fullName}</dd>
              </>
            )}
            {r.ip && (
              <>
                <dt>Gönderen IP</dt>
                <dd className="small">{r.ip}</dd>
              </>
            )}
          </dl>
        </div>
      </div>

      <div className="card">
        <h2>Talepler</h2>
        {r.description && <p style={{ whiteSpace: 'pre-wrap' }}>{r.description}</p>}
        <ol className="request-items">
          {r.items.map((item) => {
            const def = ITEMS.get(item.no)!;
            return (
              <li key={item.no}>
                <strong>{item.no}.</strong> {def.text}
                {item.option && def.options && (
                  <div>
                    <strong>
                      {item.option}) {def.options[item.option]}
                    </strong>
                  </div>
                )}
                {item.detail && (
                  <div>
                    <span className="muted">{def.detailLabel}:</span> <span style={{ whiteSpace: 'pre-wrap' }}>{item.detail}</span>
                  </div>
                )}
                {def.article && <span className="hint-block">{def.article}</span>}
              </li>
            );
          })}
        </ol>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Belgeler</h2>
          {canManage && <AddFiles onAdd={(files) => act(() => api<DataSubjectRequestDetail>(`${base}/files`, { method: 'POST', body: files }), 'Dosya eklendi.')} busy={busy} />}
        </div>
        {r.files.length === 0 ? (
          <p className="muted">Belge yok.</p>
        ) : (
          <ul className="list">
            {r.files.map((f) => (
              <li key={f.id}>
                <button type="button" className="btn-link" onClick={() => downloadFile(`${base}/files/${f.id}`, f.fileName)}>
                  {f.fileName}
                </button>{' '}
                <span className="small muted">
                  {FILE_KINDS[f.kind]} · {formatBytes(f.size)} · {formatDateTime(f.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {canManage && r.status !== 'answered' && (
        <div className="card">
          <h2>Değerlendirme</h2>
          <StatusActions r={r} busy={busy} onStatus={(status, note) => act(() => api<DataSubjectRequestDetail>(`${base}/status`, { method: 'POST', body: { status, note } }), 'Durum güncellendi.')} />
        </div>
      )}

      {r.status === 'answered' && r.answerOutcome && (
        <div className="card">
          <h2>Cevap</h2>
          <dl className="details">
            <dt>Cevap tarihi</dt>
            <dd>{formatDay(r.answeredOn)}</dd>
            <dt>Sonuç</dt>
            <dd>{DSR_OUTCOMES[r.answerOutcome]}</dd>
            <dt>Bildirim yolu</dt>
            <dd>{r.answerMethod ? DSR_ANSWER_METHODS[r.answerMethod] : '—'}</dd>
            <dt>Açıklama</dt>
            <dd style={{ whiteSpace: 'pre-wrap' }}>{r.answerSummary}</dd>
            <dt>Kaydeden</dt>
            <dd>
              {r.answerRecordedBy?.fullName ?? '—'} · {formatDateTime(r.answerRecordedAt)}
            </dd>
          </dl>
        </div>
      )}

      {canManage && (
        <AnswerForm
          r={r}
          busy={busy}
          onSave={(form) => act(() => api<DataSubjectRequestDetail>(`${base}/answer`, { method: 'POST', body: form }), r.status === 'answered' ? 'Cevap bilgisi güncellendi.' : 'Cevap kaydedildi, görev kapandı.')}
        />
      )}

      <div className="card">
        <h2>İşlem geçmişi</h2>
        <ul className="list">
          {r.events.map((e) => (
            <li key={e.id}>
              <strong>{DSR_EVENT_KINDS[e.kind]}</strong>{' '}
              <span className="small muted">
                {formatDateTime(e.createdAt)}
                {e.user && ` · ${e.user.fullName}`}
              </span>
              {e.note && <div style={{ whiteSpace: 'pre-wrap' }}>{e.note}</div>}
            </li>
          ))}
        </ul>
        {canManage && <NoteForm busy={busy} onAdd={(note) => act(() => api<DataSubjectRequestDetail>(`${base}/notes`, { method: 'POST', body: { note } }), 'Not eklendi.')} />}
      </div>
    </>
  );
}

function AssigneePicker({ current, busy, onPick }: { current: string | null; busy: boolean; onPick: (id: string, name: string) => void }) {
  const settings = useApi<RequestFormSettings>('data-subject-requests/form-settings');
  const others = (settings.data?.candidates ?? []).filter((c) => c.id !== current);
  if (others.length === 0) return null;
  return (
    <div style={{ marginTop: 6 }}>
      <select
        aria-label="Sorumluyu değiştir"
        value=""
        disabled={busy}
        onChange={(e) => {
          const c = others.find((o) => o.id === e.target.value);
          if (c) onPick(c.id, c.fullName);
        }}
      >
        <option value="">Sorumluyu değiştir…</option>
        {others.map((c) => (
          <option key={c.id} value={c.id}>
            {c.fullName} ({c.roleName})
          </option>
        ))}
      </select>
    </div>
  );
}

function StatusActions({
  r,
  busy,
  onStatus,
}: {
  r: DataSubjectRequestDetail;
  busy: boolean;
  onStatus: (status: 'in_review' | 'awaiting_info', note: string | null) => Promise<boolean>;
}) {
  const [note, setNote] = useState('');
  if (r.status === 'awaiting_info') {
    return (
      <div className="form">
        <Alert kind="warning">
          Başvurandan ek bilgi/belge bekleniyor; {formatDay(r.pausedOn)} tarihinden beri süre durdu. Bilgi geldiğinde aşağıdan bildirin, süre kaldığı
          yerden devam eder.
        </Alert>
        <Field label="Not" htmlFor="statusNote">
          <textarea id="statusNote" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} placeholder="Gelen bilgi/belge" />
        </Field>
        <div>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={async () => (await onStatus('in_review', note.trim() || null)) && setNote('')}>
            Ek bilgi alındı, süreyi devam ettir
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="form">
      <p className="small muted" style={{ margin: 0 }}>
        FRM-010'a göre başvurandan kimlik teyidi veya eksik bilgi/belge isteyebilirsiniz; bilgi gelene kadar cevap süresi işlemez.
      </p>
      <Field label="Not" htmlFor="statusNote">
        <textarea id="statusNote" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} placeholder="Ör. kimlik fotokopisi e-postayla istendi" />
      </Field>
      <div className="actions">
        {r.status === 'new' && (
          <button type="button" className="btn" disabled={busy} onClick={async () => (await onStatus('in_review', note.trim() || null)) && setNote('')}>
            İncelemeye al
          </button>
        )}
        <button type="button" className="btn" disabled={busy} onClick={async () => (await onStatus('awaiting_info', note.trim() || null)) && setNote('')}>
          Ek bilgi istendi (süreyi durdur)
        </button>
      </div>
    </div>
  );
}

function AnswerForm({ r, busy, onSave }: { r: DataSubjectRequestDetail; busy: boolean; onSave: (form: FormData) => Promise<boolean> }) {
  const answered = r.status === 'answered';
  const [open, setOpen] = useState(!answered);
  const [answeredOn, setAnsweredOn] = useState(r.answeredOn ?? todayIso());
  const [outcome, setOutcome] = useState<DsrOutcome | ''>(r.answerOutcome ?? '');
  const [method, setMethod] = useState<DsrAnswerMethod | ''>(r.answerMethod ?? (r.responseMethod === 'email' ? 'email' : r.responseMethod === 'in_person' ? 'in_person' : r.responseMethod === 'postal' ? 'postal' : ''));
  const [summary, setSummary] = useState(r.answerSummary ?? '');
  const files = useRequestFiles();

  async function submit(e: FormEvent) {
    e.preventDefault();
    const form = new FormData();
    form.append('answeredOn', answeredOn);
    form.append('outcome', outcome);
    form.append('method', method);
    form.append('summary', summary.trim());
    for (const f of files.files) form.append('files', f);
    if (await onSave(form)) {
      files.clear();
      if (answered) setOpen(false);
    }
  }

  if (!open) {
    return (
      <p>
        <button type="button" className="btn btn-small" onClick={() => setOpen(true)}>
          Cevap bilgisini düzelt
        </button>
      </p>
    );
  }
  return (
    <div className="card">
      <h2>{answered ? 'Cevap bilgisini düzelt' : 'Cevabı kaydet'}</h2>
      <p className="small muted">
        Cevabı ilgili kişiye yazılı olarak veya elektronik ortamda bildirdikten sonra buraya kaydedin (PRS-010). Cevap yazısında veri sorumlusu
        bilgileri, başvuranın kimlik ve iletişim bilgileri, talep konusu ve açıklamalarınız bulunmalıdır.
      </p>
      <form className="form" onSubmit={submit}>
        <div className="form-row">
          <Field label="Cevabın bildirildiği gün" required htmlFor="answeredOn">
            <input id="answeredOn" type="date" value={answeredOn} max={todayIso()} onChange={(e) => setAnsweredOn(e.target.value)} required />
          </Field>
          <Field label="Sonuç" required htmlFor="outcome">
            <select id="outcome" value={outcome} onChange={(e) => setOutcome(e.target.value as DsrOutcome)} required>
              <option value="">Seçiniz</option>
              {(Object.keys(DSR_OUTCOMES) as DsrOutcome[]).map((k) => (
                <option key={k} value={k}>
                  {DSR_OUTCOMES[k]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Bildirim yolu" required htmlFor="method">
            <select id="method" value={method} onChange={(e) => setMethod(e.target.value as DsrAnswerMethod)} required>
              <option value="">Seçiniz</option>
              {(Object.keys(DSR_ANSWER_METHODS) as DsrAnswerMethod[]).map((k) => (
                <option key={k} value={k}>
                  {DSR_ANSWER_METHODS[k]}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Veri sorumlusunun açıklamaları" required htmlFor="summary" hint="Cevabın özeti; ret veya kısmi kabulde gerekçe.">
          <textarea id="summary" rows={4} value={summary} onChange={(e) => setSummary(e.target.value)} required minLength={3} maxLength={5000} />
        </Field>
        <RequestFilesField state={files} label="Cevap yazısı (isteğe bağlı)" />
        <div className="actions">
          <button className="btn btn-primary" disabled={busy}>
            {answered ? 'Güncelle' : 'Cevabı kaydet'}
          </button>
          {answered && (
            <button type="button" className="btn" onClick={() => setOpen(false)}>
              Vazgeç
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

function AddFiles({ onAdd, busy }: { onAdd: (form: FormData) => Promise<boolean>; busy: boolean }) {
  const files = useRequestFiles();
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" className="btn btn-small" onClick={() => setOpen(true)}>
        + Belge ekle
      </button>
    );
  }
  return (
    <div className="form" style={{ width: '100%' }}>
      <RequestFilesField state={files} label="Eklenecek belgeler" />
      <div className="actions">
        <button
          type="button"
          className="btn btn-primary btn-small"
          disabled={busy || files.files.length === 0}
          onClick={async () => {
            const form = new FormData();
            for (const f of files.files) form.append('files', f);
            if (await onAdd(form)) {
              files.clear();
              setOpen(false);
            }
          }}
        >
          Yükle
        </button>
        <button type="button" className="btn btn-small" onClick={() => setOpen(false)}>
          Vazgeç
        </button>
      </div>
    </div>
  );
}

function NoteForm({ onAdd, busy }: { onAdd: (note: string) => Promise<boolean>; busy: boolean }) {
  const [note, setNote] = useState('');
  return (
    <form
      className="form"
      style={{ marginTop: 12 }}
      onSubmit={async (e) => {
        e.preventDefault();
        if (await onAdd(note.trim())) setNote('');
      }}
    >
      <Field label="Not ekle" htmlFor="eventNote">
        <textarea id="eventNote" rows={2} value={note} onChange={(e) => setNote(e.target.value)} required maxLength={2000} placeholder="Ör. başvuran telefonla arandı, kimliği teyit edildi" />
      </Field>
      <div>
        <button className="btn btn-small" disabled={busy || !note.trim()}>
          Notu kaydet
        </button>
      </div>
    </form>
  );
}
