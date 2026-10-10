'use client';

import { CONTRACT_FIELD_LABELS as L, CONTRACT_STATUSES, CONTRACT_TYPES, ContractStatus, ContractType } from '@kvkk/shared';
import { FormEvent, useState } from 'react';
import { errorText } from '@/lib/api';
import type { Contract } from '@/lib/types';
import { ErrorAlert, Field } from './ui';

export interface ContractValues {
  partyName: string;
  type: ContractType | '';
  startDate: string;
  endDate: string;
  status: ContractStatus;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  description: string;
}

function toValues(c?: Contract): ContractValues {
  return {
    partyName: c?.partyName ?? '',
    type: c?.type ?? '',
    startDate: c?.startDate ?? '',
    endDate: c?.endDate ?? '',
    status: c?.status ?? 'draft',
    contactName: c?.contactName ?? '',
    contactPhone: c?.contactPhone ?? '',
    contactEmail: c?.contactEmail ?? '',
    description: c?.description ?? '',
  };
}

/** Boş alanlar API'ye null olarak gider. */
export function toPayload(v: ContractValues) {
  const orNull = (s: string) => s.trim() || null;
  return {
    partyName: v.partyName.trim(),
    type: v.type,
    startDate: v.startDate || null,
    endDate: v.endDate || null,
    status: v.status,
    contactName: orNull(v.contactName),
    contactPhone: orNull(v.contactPhone),
    contactEmail: orNull(v.contactEmail),
    description: orNull(v.description),
  };
}

export function ContractForm({
  initial,
  readOnly,
  submitLabel,
  onSubmit,
}: {
  initial?: Contract;
  readOnly?: boolean;
  submitLabel: string;
  onSubmit: (values: ContractValues) => Promise<void>;
}) {
  const [values, setValues] = useState<ContractValues>(() => toValues(initial));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof ContractValues>(key: K, value: ContractValues[K]) => setValues((v) => ({ ...v, [key]: value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit(values);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <ErrorAlert error={error} />
      <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 14 }}>
        <Field label={L.partyName} htmlFor="partyName" required hint="Kişinin adı soyadı veya kurumun ünvanı">
          <input id="partyName" value={values.partyName} onChange={(e) => set('partyName', e.target.value)} required maxLength={300} />
        </Field>
        <div className="form-row">
          <Field label={L.type} htmlFor="type" required>
            <select id="type" value={values.type} onChange={(e) => set('type', e.target.value as ContractType)} required>
              <option value="">Seçin</option>
              {(Object.keys(CONTRACT_TYPES) as ContractType[]).map((t) => (
                <option key={t} value={t}>
                  {CONTRACT_TYPES[t]}
                </option>
              ))}
            </select>
          </Field>
          <Field label={L.status} htmlFor="status" required>
            <select id="status" value={values.status} onChange={(e) => set('status', e.target.value as ContractStatus)} required>
              {(Object.keys(CONTRACT_STATUSES) as ContractStatus[]).map((s) => (
                <option key={s} value={s}>
                  {CONTRACT_STATUSES[s]}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="form-row">
          <Field label={L.startDate} htmlFor="startDate">
            <input id="startDate" type="date" value={values.startDate} onChange={(e) => set('startDate', e.target.value)} />
          </Field>
          <Field label={L.endDate} htmlFor="endDate" hint="Belirsiz süreli sözleşmelerde boş bırakın.">
            <input
              id="endDate"
              type="date"
              min={values.startDate || undefined}
              value={values.endDate}
              onChange={(e) => set('endDate', e.target.value)}
            />
          </Field>
        </div>
        <h3 style={{ marginTop: 6 }}>İlgili kişi</h3>
        <div className="form-row">
          <Field label="Ad soyad" htmlFor="contactName">
            <input id="contactName" value={values.contactName} onChange={(e) => set('contactName', e.target.value)} maxLength={200} />
          </Field>
          <Field label="Telefon" htmlFor="contactPhone">
            <input
              id="contactPhone"
              type="tel"
              value={values.contactPhone}
              onChange={(e) => set('contactPhone', e.target.value)}
              maxLength={50}
            />
          </Field>
        </div>
        <Field label="E-posta" htmlFor="contactEmail">
          <input
            id="contactEmail"
            type="email"
            value={values.contactEmail}
            onChange={(e) => set('contactEmail', e.target.value)}
            maxLength={254}
          />
        </Field>
        <Field label={L.description} htmlFor="description">
          <textarea id="description" value={values.description} onChange={(e) => set('description', e.target.value)} maxLength={5000} />
        </Field>
      </fieldset>
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
