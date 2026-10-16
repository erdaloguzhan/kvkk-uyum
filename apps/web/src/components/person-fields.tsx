'use client';

import { Field } from './ui';

/** Çalışan ve eğitimci formlarında ortak kişi alanları. */
export interface PersonForm {
  nationalId: string;
  firstName: string;
  lastName: string;
  hireDate: string;
  terminationDate: string;
  phone: string;
  email: string;
}

export const emptyPerson: PersonForm = { nationalId: '', firstName: '', lastName: '', hireDate: '', terminationDate: '', phone: '', email: '' };

export function toPersonForm(p: Partial<Record<keyof PersonForm, string | null>>): PersonForm {
  return Object.fromEntries(Object.keys(emptyPerson).map((k) => [k, p[k as keyof PersonForm] ?? ''])) as unknown as PersonForm;
}

export function PersonFields({
  value,
  onChange,
  emailRequired,
  emailHint,
  emailReadOnly,
}: {
  value: PersonForm;
  onChange: (v: PersonForm) => void;
  emailRequired?: boolean;
  emailHint?: string;
  emailReadOnly?: boolean;
}) {
  const set = (k: keyof PersonForm) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, [k]: e.target.value });
  return (
    <>
      <Field label="T.C. Kimlik No" required htmlFor="p-tc">
        <input id="p-tc" inputMode="numeric" maxLength={11} value={value.nationalId} onChange={set('nationalId')} required />
      </Field>
      <div className="form-row">
        <Field label="Adı" required htmlFor="p-ad">
          <input id="p-ad" value={value.firstName} onChange={set('firstName')} required />
        </Field>
        <Field label="Soyadı" required htmlFor="p-soyad">
          <input id="p-soyad" value={value.lastName} onChange={set('lastName')} required />
        </Field>
      </div>
      <div className="form-row">
        <Field label="İşe giriş tarihi" htmlFor="p-giris">
          <input id="p-giris" type="date" value={value.hireDate} onChange={set('hireDate')} />
        </Field>
        <Field label="İşten çıkış tarihi" htmlFor="p-cikis">
          <input id="p-cikis" type="date" value={value.terminationDate} onChange={set('terminationDate')} />
        </Field>
      </div>
      <div className="form-row">
        <Field label="Cep telefonu" htmlFor="p-tel">
          <input id="p-tel" type="tel" value={value.phone} onChange={set('phone')} />
        </Field>
        <Field label="E-posta adresi" required={emailRequired} htmlFor="p-eposta" hint={emailHint}>
          <input
            id="p-eposta"
            type="email"
            value={value.email}
            onChange={set('email')}
            required={emailRequired}
            readOnly={emailReadOnly}
          />
        </Field>
      </div>
    </>
  );
}
