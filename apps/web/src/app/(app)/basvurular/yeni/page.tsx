'use client';

import { DSR_CHANNELS, DsrChannel } from '@kvkk/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { ApplicantFields, applicantErrorText, applicantFormData, emptyApplicant, RequestFilesField, useRequestFiles } from '@/components/request-form';
import { ErrorAlert, Field, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { todayIso } from '@/lib/labels';
import type { DataSubjectRequestDetail } from '@/lib/types';

const CHANNELS = (Object.keys(DSR_CHANNELS) as DsrChannel[]).filter((c) => c !== 'web_form');

/** Elden, noterden, postayla, KEP veya e-postayla gelen başvurunun sisteme girilmesi (PRS-010: başvurunun alınması). */
export default function NewRequestPage() {
  const router = useRouter();
  const [value, setValue] = useState(emptyApplicant);
  const [channel, setChannel] = useState<DsrChannel>('in_person');
  const [receivedOn, setReceivedOn] = useState(todayIso());
  const files = useRequestFiles();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
      form.append('channel', channel);
      form.append('receivedOn', receivedOn);
      const created = await api<DataSubjectRequestDetail>('data-subject-requests', { method: 'POST', body: form });
      router.push(`/basvurular/${created.id}`);
    } catch (err) {
      setError(applicantErrorText(err));
      setBusy(false);
    }
  }

  return (
    <>
      <p className="small">
        <Link href="/basvurular">← İlgili kişi başvuruları</Link>
      </p>
      <PageHeader
        title="Başvuru kaydet"
        description="Bizzat yazılı formla, noter, posta, KEP veya e-postayla gelen başvuruyu sisteme girin. Online formdan gelenler kendiliğinden kaydedilir."
      />
      <form className="form card" onSubmit={submit}>
        <div className="form-row">
          <Field label="Başvurunun geliş yolu" required htmlFor="channel">
            <select id="channel" value={channel} onChange={(e) => setChannel(e.target.value as DsrChannel)}>
              {CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {DSR_CHANNELS[c]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Başvurunun alındığı tarih" required htmlFor="receivedOn" hint="Cevap süresi bu günden itibaren sayılır.">
            <input id="receivedOn" type="date" value={receivedOn} max={todayIso()} onChange={(e) => setReceivedOn(e.target.value)} required />
          </Field>
        </div>
        <ApplicantFields value={value} onChange={setValue} phoneRequired={false} />
        <RequestFilesField state={files} hint="Taranmış başvuru formu, kimlik fotokopisi, vekâletname gibi belgeler: PDF, JPEG veya PNG; en fazla 5 dosya, her biri 5 MB." />
        <ErrorAlert error={error} />
        <div>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Kaydediliyor…' : 'Başvuruyu kaydet'}
          </button>
        </div>
      </form>
    </>
  );
}
