'use client';

import { FormEvent, useState } from 'react';
import type { Organization } from '@/lib/types';
import { ErrorAlert, Field } from './ui';

export type OrgProfile = Pick<
  Organization,
  'name' | 'taxNumber' | 'address' | 'email' | 'phone' | 'kepAddress' | 'authorizedPerson' | 'website'
>;

const EMPTY: OrgProfile = {
  name: '',
  taxNumber: '',
  address: '',
  email: '',
  phone: '',
  kepAddress: '',
  authorizedPerson: '',
  website: '',
};

/** Dokümanlara otomatik yerleşen alanlar; kurulumun tamamlanması için KEP adresi ve web sitesi dışındakiler gerekir. */
export function OrgForm({
  initial,
  submitLabel,
  readOnly,
  onSubmit,
}: {
  initial?: Partial<OrgProfile>;
  submitLabel: string;
  readOnly?: boolean;
  onSubmit: (profile: OrgProfile) => Promise<void>;
}) {
  const [v, setV] = useState<OrgProfile>(() => {
    const merged = { ...EMPTY };
    for (const k of Object.keys(EMPTY) as (keyof OrgProfile)[]) merged[k] = (initial?.[k] ?? '') as never;
    return merged;
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const bind = (k: keyof OrgProfile) => ({
    id: k,
    value: v[k] ?? '',
    disabled: readOnly,
    onChange: (e: { target: { value: string } }) => setV((cur) => ({ ...cur, [k]: e.target.value })),
  });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // Boş bırakılan alanlar "girilmedi" olarak gönderilir.
      const clean = Object.fromEntries(
        Object.entries(v).map(([k, val]) => [k, typeof val === 'string' && val.trim() === '' ? null : val?.trim()]),
      ) as OrgProfile;
      await onSubmit(clean);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <ErrorAlert error={error} />
      <Field label="Ünvan" required htmlFor="name" hint="Ticaret sicilindeki tam ünvan. Dokümanlarda {{kurum.unvan}} yerine yazılır.">
        <input {...bind('name')} required minLength={2} />
      </Field>
      <div className="form-row">
        <Field label="Vergi numarası" required htmlFor="taxNumber" hint="10 haneli vergi no veya şahıs şirketleri için 11 haneli TC kimlik no">
          <input {...bind('taxNumber')} inputMode="numeric" pattern="\d{10,11}" />
        </Field>
        <Field label="Yetkili kişi" required htmlFor="authorizedPerson" hint="Ad soyad">
          <input {...bind('authorizedPerson')} />
        </Field>
      </div>
      <Field label="Adres" required htmlFor="address">
        <textarea {...bind('address')} rows={3} />
      </Field>
      <div className="form-row">
        <Field label="E-posta" required htmlFor="email">
          <input type="email" {...bind('email')} />
        </Field>
        <Field label="Telefon" required htmlFor="phone">
          <input type="tel" {...bind('phone')} />
        </Field>
      </div>
      <div className="form-row">
        <Field label="KEP adresi" htmlFor="kepAddress" hint="Kayıtlı elektronik posta, ör. firma@hs01.kep.tr">
          <input type="email" {...bind('kepAddress')} />
        </Field>
        <Field label="Web sitesi" htmlFor="website" hint="Aydınlatma metinlerinde kullanılır">
          <input {...bind('website')} placeholder="www.ornek.com.tr" />
        </Field>
      </div>
      {!readOnly && (
        <div>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Kaydediliyor…' : submitLabel}
          </button>
        </div>
      )}
    </form>
  );
}

export const SETUP_REQUIRED: (keyof OrgProfile)[] = [
  'name',
  'taxNumber',
  'address',
  'email',
  'phone',
  'authorizedPerson',
];

/** Doküman şablonları için dolu olması gereken alanlar. KEP adresi ve web sitesi zorunlu değildir. */
export const DOCUMENT_REQUIRED: (keyof OrgProfile)[] = SETUP_REQUIRED;
