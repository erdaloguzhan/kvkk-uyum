'use client';

import { DSR_FORM_CLOSING, DSR_FORM_INTRO, DSR_FORM_TITLE, DSR_FORM_VERIFICATION, DSR_LEGAL_DAYS } from '@kvkk/shared';
import { FormEvent, useEffect, useState } from 'react';
import { ApplicantFields, applicantErrorText, applicantFormData, emptyApplicant, RequestFilesField, useRequestFiles } from '@/components/request-form';
import { Alert, ErrorAlert, Loading } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { solveCaptcha } from '@/lib/captcha';
import { formatDateTime } from '@/lib/labels';

interface FormInfo {
  organizationName: string;
  website: string | null;
}

interface Submitted {
  number: string;
  receivedAt: string;
  organizationName: string;
}

export function PublicRequestForm({ formKey, embedded }: { formKey: string; embedded: boolean }) {
  const [info, setInfo] = useState<FormInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [value, setValue] = useState(emptyApplicant);
  const [consent, setConsent] = useState(false);
  const files = useRequestFiles();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Submitted | null>(null);
  const path = `request-form/${encodeURIComponent(formKey)}`;

  useEffect(() => {
    api<FormInfo>(path, { auth: false })
      .then(setInfo)
      .catch((err) => setLoadError(errorText(err)));
  }, [path]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!Object.values(value.items).some((i) => i.checked)) {
      setError('En az bir talep seçiniz.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const form = applicantFormData(value, files.files);
      form.append('consent', String(consent));
      form.append('captchaToken', await solveCaptcha());
      setDone(await api<Submitted>(path, { method: 'POST', body: form, auth: false }));
      window.scrollTo({ top: 0 });
    } catch (err) {
      setError(applicantErrorText(err));
    } finally {
      setBusy(false);
    }
  }

  let content;
  if (loadError) {
    content = <Alert kind="error">Başvuru formu bulunamadı veya şu anda başvuru alınmıyor. Lütfen kurumla iletişime geçiniz.</Alert>;
  } else if (!info) {
    content = <Loading />;
  } else if (done) {
    content = (
      <div className="card">
        <h2>Başvurunuz alındı</h2>
        <p>
          {done.organizationName} kuruluşuna yaptığınız başvuru {formatDateTime(done.receivedAt)} tarihinde kaydedildi.
        </p>
        <p>
          Başvuru numaranız: <strong>{done.number}</strong>
        </p>
        <p className="muted">
          Başvurunuz Kanun’un 13. maddesi uyarınca değerlendirilerek en geç {DSR_LEGAL_DAYS} gün içinde seçtiğiniz yöntemle cevaplanacaktır. E-posta
          adresi verdiyseniz başvuru numaranız e-postayla da gönderildi. Kimliğinizi teyit etmek için sizinle iletişime geçilebilir.
        </p>
      </div>
    );
  } else {
    content = (
      <form className="form card" onSubmit={submit} noValidate={false}>
        <div className="form-text">
          {DSR_FORM_INTRO.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
        <ApplicantFields value={value} onChange={setValue} phoneRequired />
        <RequestFilesField
          state={files}
          hint="Talebinizi destekleyen belgeler (nüfus cüzdanı fotokopisi, ikametgâh, mahkeme kararı gibi): PDF, JPEG veya PNG; en fazla 5 dosya, her biri 5 MB."
        />
        <div className="form-text">
          {DSR_FORM_VERIFICATION.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
        <label className="checkbox">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} required />
          <span>{DSR_FORM_CLOSING}</span>
        </label>
        <ErrorAlert error={error} />
        <div>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Gönderiliyor…' : 'Başvuruyu gönder'}
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className={`public-form${embedded ? ' embedded' : ''}`}>
      <main className="public-form-main">
        <div className="public-form-head">
          <div>
            {info && <p className="muted small" style={{ margin: 0 }}>{info.organizationName}</p>}
            <h1>{DSR_FORM_TITLE}</h1>
            <p className="muted" style={{ margin: 0 }}>6698 sayılı Kişisel Verilerin Korunması Kanunu md. 11 kapsamındaki başvurular için</p>
          </div>
        </div>
        {content}
        {!embedded && <p className="small muted">Bu form KVK Uyum Yönetim Sistemi üzerinden {info?.organizationName ?? 'kuruluş'} adına alınmaktadır.</p>}
      </main>
    </div>
  );
}
