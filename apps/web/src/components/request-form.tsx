'use client';

import {
  DSR_ATTACHMENT_MAX_BYTES,
  DSR_ATTACHMENT_MAX_FILES,
  DSR_ATTACHMENT_MIME_TYPES,
  DSR_RELATIONSHIPS,
  DSR_REQUEST_ITEMS,
  DSR_RESPONSE_METHODS,
  DsrRelationship,
  DsrResponseMethod,
} from '@kvkk/shared';
import { useRef, useState } from 'react';
import { ApiError, errorText } from '@/lib/api';
import { formatBytes } from '@/lib/labels';
import { ErrorAlert, Field } from './ui';

/** FRM-010 alanlarının form durumu. Talepler madde numarasına göre tutulur. */
export interface ApplicantState {
  fullName: string;
  nationalId: string;
  birthDate: string;
  phone: string;
  email: string;
  address: string;
  relationship: DsrRelationship | '';
  relationshipDetail: string;
  responseMethod: DsrResponseMethod | '';
  description: string;
  items: Record<number, { checked: boolean; detail: string; option: '' | 'a' | 'b' | 'c' }>;
}

export function emptyApplicant(): ApplicantState {
  return {
    fullName: '',
    nationalId: '',
    birthDate: '',
    phone: '',
    email: '',
    address: '',
    relationship: '',
    relationshipDetail: '',
    responseMethod: '',
    description: '',
    items: Object.fromEntries(DSR_REQUEST_ITEMS.map((i) => [i.no, { checked: false, detail: '', option: '' }])),
  };
}

/** Çok parçalı form gövdesi (talepler JSON olarak). */
export function applicantFormData(s: ApplicantState, files: File[]) {
  const form = new FormData();
  const fields: Record<string, string> = {
    fullName: s.fullName.trim(),
    nationalId: s.nationalId.trim(),
    birthDate: s.birthDate,
    phone: s.phone.trim(),
    email: s.email.trim(),
    address: s.address.trim(),
    relationship: s.relationship,
    relationshipDetail: DSR_RELATIONSHIPS[s.relationship as DsrRelationship] && 'detail' in DSR_RELATIONSHIPS[s.relationship as DsrRelationship] ? s.relationshipDetail.trim() : '',
    responseMethod: s.responseMethod,
    description: s.description.trim(),
  };
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  const items = DSR_REQUEST_ITEMS.filter((d) => s.items[d.no].checked).map((d) => ({
    no: d.no,
    ...(d.detailLabel ? { detail: s.items[d.no].detail.trim() } : {}),
    ...(d.options ? { option: s.items[d.no].option || null } : {}),
  }));
  form.append('items', JSON.stringify(items));
  for (const f of files) form.append('files', f);
  return form;
}

const FIELD_NAMES: Record<string, string> = {
  fullName: 'Ad soyad',
  nationalId: 'T.C. kimlik numarası',
  birthDate: 'Doğum tarihi',
  phone: 'Cep telefonu',
  email: 'E-posta',
  address: 'Adres',
  relationship: 'İşyerimiz ile ilişkiniz',
  relationshipDetail: 'İlişki açıklaması',
  responseMethod: 'Yanıt yöntemi',
  items: 'Talepler',
  consent: 'Beyan',
  channel: 'Başvuru yolu',
  receivedOn: 'Başvuru tarihi',
};

/** API'nin alan hatalarını kullanıcıya anlaşılır biçimde listeler (talep hataları kendi mesajını taşır). */
export function applicantErrorText(err: unknown): string {
  if (err instanceof ApiError && err.body.errors?.length) {
    return err.body.errors
      .map((e) => {
        const field = e.path?.split('.')[0] ?? '';
        if (field === 'items' && e.path !== 'items') return e.message;
        return FIELD_NAMES[field] ? `${FIELD_NAMES[field]}: ${e.message}` : e.message;
      })
      .join(' · ');
  }
  return errorText(err);
}

export function ApplicantFields({ value, onChange, phoneRequired }: { value: ApplicantState; onChange: (v: ApplicantState) => void; phoneRequired: boolean }) {
  const set = <K extends keyof ApplicantState>(key: K, v: ApplicantState[K]) => onChange({ ...value, [key]: v });
  const setItem = (no: number, patch: Partial<ApplicantState['items'][number]>) =>
    onChange({ ...value, items: { ...value.items, [no]: { ...value.items[no], ...patch } } });
  const relationshipDef = value.relationship ? DSR_RELATIONSHIPS[value.relationship] : null;

  return (
    <>
      <h2 className="form-section">Veri sahibi bilgileri</h2>
      <div className="form-row">
        <Field label="Ad Soyad" required htmlFor="fullName">
          <input id="fullName" value={value.fullName} onChange={(e) => set('fullName', e.target.value)} required minLength={3} maxLength={150} autoComplete="name" />
        </Field>
        <Field label="T.C. Kimlik Numarası" htmlFor="nationalId" hint="Yabancı uyruklu iseniz boş bırakıp uyruk ve pasaport numaranızı açıklamaya yazınız.">
          <input
            id="nationalId"
            value={value.nationalId}
            onChange={(e) => set('nationalId', e.target.value.replace(/\D/g, '').slice(0, 11))}
            inputMode="numeric"
            pattern="\d{11}"
            maxLength={11}
          />
        </Field>
        <Field label="Doğum Tarihi" htmlFor="birthDate">
          <input id="birthDate" type="date" value={value.birthDate} onChange={(e) => set('birthDate', e.target.value)} autoComplete="bday" />
        </Field>
        <Field label="Cep Telefonu" required={phoneRequired} htmlFor="phone" hint="05XX XXX XX XX">
          <input id="phone" type="tel" value={value.phone} onChange={(e) => set('phone', e.target.value)} required={phoneRequired} maxLength={30} autoComplete="tel" />
        </Field>
        <Field label="E-posta (varsa)" required={value.responseMethod === 'email'} htmlFor="email">
          <input id="email" type="email" value={value.email} onChange={(e) => set('email', e.target.value)} required={value.responseMethod === 'email'} maxLength={254} autoComplete="email" />
        </Field>
      </div>
      <Field label="Adres" required={value.responseMethod === 'postal'} htmlFor="address">
        <textarea id="address" rows={2} value={value.address} onChange={(e) => set('address', e.target.value)} required={value.responseMethod === 'postal'} maxLength={1000} autoComplete="street-address" />
      </Field>

      <div className="form-row">
        <fieldset className="choice-group">
          <legend className="required">İşyerimiz ile olan ilişkiniz</legend>
          {(Object.keys(DSR_RELATIONSHIPS) as DsrRelationship[]).map((k) => (
            <label key={k} className="checkbox">
              <input type="radio" name="relationship" value={k} checked={value.relationship === k} onChange={() => set('relationship', k)} required />
              {DSR_RELATIONSHIPS[k].label}
            </label>
          ))}
          {relationshipDef && 'detail' in relationshipDef && (
            <Field label={relationshipDef.detail} required={value.relationship === 'other'} htmlFor="relationshipDetail">
              <input
                id="relationshipDetail"
                value={value.relationshipDetail}
                onChange={(e) => set('relationshipDetail', e.target.value)}
                required={value.relationship === 'other'}
                maxLength={300}
              />
            </Field>
          )}
        </fieldset>
        <fieldset className="choice-group">
          <legend className="required">Başvurunuza vereceğimiz yanıtın tarafınıza bildirilme yöntemi</legend>
          {(Object.keys(DSR_RESPONSE_METHODS) as DsrResponseMethod[]).map((k) => {
            const m = DSR_RESPONSE_METHODS[k];
            return (
              <label key={k} className="checkbox">
                <input type="radio" name="responseMethod" value={k} checked={value.responseMethod === k} onChange={() => set('responseMethod', k)} required />
                <span>
                  {m.label}
                  {'note' in m && <span className="hint-block">{m.note}</span>}
                </span>
              </label>
            );
          })}
        </fieldset>
      </div>

      <h2 className="form-section">Kanun kapsamındaki talebiniz</h2>
      <Field label="Lütfen Kanun kapsamındaki talebinizi detaylı olarak açıklayınız" htmlFor="description">
        <textarea id="description" rows={4} value={value.description} onChange={(e) => set('description', e.target.value)} maxLength={5000} />
      </Field>
      <p className="small muted">Aşağıdaki taleplerden ilgili olanları işaretleyiniz (en az bir tane).</p>
      <ol className="request-items">
        {DSR_REQUEST_ITEMS.map((d) => {
          const item = value.items[d.no];
          return (
            <li key={d.no} className={item.checked ? 'selected' : undefined}>
              <label className="checkbox">
                <input type="checkbox" checked={item.checked} onChange={(e) => setItem(d.no, { checked: e.target.checked })} />
                <span>
                  <strong>{d.no}.</strong> {d.text}
                  {d.article && <span className="hint-block">{d.article}</span>}
                </span>
              </label>
              {item.checked && d.options && (
                <div className="item-extra" role="radiogroup" aria-label={`Talep ${d.no} seçeneği`}>
                  <span className="small muted">Sadece bir seçenek işaretlenebilir.</span>
                  {(Object.entries(d.options) as ['a' | 'b' | 'c', string][]).map(([k, text]) => (
                    <label key={k} className="checkbox">
                      <input type="radio" name={`item-${d.no}`} checked={item.option === k} onChange={() => setItem(d.no, { option: k })} required />
                      {k}) {text}
                    </label>
                  ))}
                </div>
              )}
              {item.checked && d.detailLabel && (
                <div className="item-extra">
                  <Field label={d.detailLabel} required htmlFor={`item-${d.no}-detail`} hint={d.detailHint}>
                    <textarea
                      id={`item-${d.no}-detail`}
                      rows={2}
                      value={item.detail}
                      onChange={(e) => setItem(d.no, { detail: e.target.value })}
                      required
                      maxLength={2000}
                    />
                  </Field>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </>
  );
}

const ACCEPT = DSR_ATTACHMENT_MIME_TYPES.join(',');

export function useRequestFiles() {
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  function add(list: File[]) {
    const errors: string[] = [];
    const next = [...files];
    for (const f of list) {
      if (!(DSR_ATTACHMENT_MIME_TYPES as readonly string[]).includes(f.type)) errors.push(`${f.name}: yalnızca PDF, JPEG veya PNG eklenebilir`);
      else if (f.size > DSR_ATTACHMENT_MAX_BYTES) errors.push(`${f.name}: dosya en fazla 5 MB olabilir`);
      else if (next.length >= DSR_ATTACHMENT_MAX_FILES) errors.push(`${f.name}: en fazla ${DSR_ATTACHMENT_MAX_FILES} dosya eklenebilir`);
      else next.push(f);
    }
    setError(errors.length ? errors.join('; ') : null);
    setFiles(next);
  }
  return { files, error, add, remove: (i: number) => setFiles(files.filter((_, j) => j !== i)), clear: () => setFiles([]) };
}

export function RequestFilesField({ state, label = 'Ek belgeler', hint }: { state: ReturnType<typeof useRequestFiles>; label?: string; hint?: string }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <Field label={label} hint={hint ?? `PDF, JPEG veya PNG; en fazla ${DSR_ATTACHMENT_MAX_FILES} dosya, her biri 5 MB.`}>
      <div className="file-chips">
        {state.files.map((f, i) => (
          <span key={`${f.name}-${i}`} className="chip">
            {f.name} ({formatBytes(f.size)})
            <button type="button" className="btn-link" aria-label={`${f.name} kaldır`} onClick={() => state.remove(i)}>
              ✕
            </button>
          </span>
        ))}
        <button type="button" className="btn btn-small" onClick={() => input.current?.click()}>
          + Dosya ekle
        </button>
      </div>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        onChange={(e) => {
          state.add(Array.from(e.target.files ?? []));
          e.target.value = '';
        }}
      />
      <ErrorAlert error={state.error} />
    </Field>
  );
}
