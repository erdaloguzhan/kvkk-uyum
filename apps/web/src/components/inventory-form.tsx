'use client';

import type { InventoryField, InventoryListField, InventoryTextField, StorageMedium } from '@kvkk/shared';
import { FormEvent, useId, useMemo, useState } from 'react';
import { fieldLabel } from '@/lib/labels';
import type { InventoryEntry, InventoryOptions } from '@/lib/types';
import { MultiSelect } from './multi-select';
import { ErrorAlert, Field } from './ui';

export type InventoryValues = Pick<
  InventoryEntry,
  InventoryTextField | InventoryListField | 'storageMedium'
>;

const EMPTY: InventoryValues = {
  department: '',
  activity: '',
  dataCategory: '',
  personalData: '',
  specialCategoryData: '',
  purposes: [],
  storageMedium: null,
  storageLocation: '',
  dataSubjectGroups: [],
  legalBases: [],
  relatedLegislation: '',
  retentionPeriod: '',
  recipients: [],
  foreignTransfers: '',
  administrativeMeasures: [],
  technicalMeasures: [],
};

/** VERBİS'teki gibi adım adım giriş: her adım TBL-010'un bir sütun grubuna karşılık gelir. */
const STEPS: { title: string; fields: InventoryField[] }[] = [
  { title: '1. Süreç', fields: ['department', 'activity'] },
  { title: '2. Kişisel veri', fields: ['dataCategory', 'personalData', 'specialCategoryData', 'dataSubjectGroups'] },
  { title: '3. Amaç ve hukuki sebep', fields: ['purposes', 'legalBases', 'relatedLegislation'] },
  { title: '4. Saklama', fields: ['storageMedium', 'storageLocation', 'retentionPeriod'] },
  { title: '5. Aktarım', fields: ['recipients', 'foreignTransfers'] },
  { title: '6. Güvenlik tedbirleri', fields: ['administrativeMeasures', 'technicalMeasures'] },
];

const HINTS: Partial<Record<InventoryField, string>> = {
  department: 'Verinin işlendiği birim, ör. İnsan Kaynakları',
  activity: 'Verinin işlendiği süreç, ör. Çalışan Özlük Dosyaları',
  personalData: 'Bu kategoride işlenen veriler, ör. ad soyad, TC kimlik no',
  specialCategoryData: 'Varsa sağlık, biyometrik gibi özel nitelikli veriler. Kişisel Veri veya bu alandan en az biri dolu olmalı.',
  storageLocation: 'Ör. personel dolabı, İK yazılımı, sunucu',
  retentionPeriod: 'Ör. işten ayrılıştan itibaren 10 yıl',
  foreignTransfers: 'Yurt dışına aktarılıyorsa hangi veri, hangi ülkeye',
};

const LONG_TEXT: InventoryField[] = ['personalData', 'specialCategoryData', 'foreignTransfers'];

export function isMissing(values: InventoryValues, field: InventoryField, required: InventoryField[]): boolean {
  if (field === 'personalData' || field === 'specialCategoryData') {
    return !values.personalData?.trim() && !values.specialCategoryData?.trim();
  }
  if (!required.includes(field)) return false;
  const v = values[field];
  return Array.isArray(v) ? v.length === 0 : !v || (typeof v === 'string' && !v.trim());
}

export function InventoryForm({
  options,
  initial,
  submitLabel,
  readOnly,
  onSubmit,
}: {
  options: InventoryOptions;
  initial?: Partial<InventoryValues>;
  submitLabel: string;
  readOnly?: boolean;
  onSubmit: (values: InventoryValues) => Promise<void>;
}) {
  const [values, setValues] = useState<InventoryValues>(() => ({ ...EMPTY, ...stripNulls(initial) }));
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const listId = useId();
  const required = options.requiredFields;

  const categoryInfo = useMemo(
    () => new Map(options.dataCategories.map((c) => [c.name, c])),
    [options.dataCategories],
  );
  const set = <K extends keyof InventoryValues>(k: K, v: InventoryValues[K]) => setValues((cur) => ({ ...cur, [k]: v }));
  const stepMissing = (i: number) => STEPS[i].fields.some((f) => isMissing(values, f, required));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const first = (['department', 'activity', 'dataCategory'] as const).find((f) => !values[f].trim());
    if (first) {
      setStep(STEPS.findIndex((s) => s.fields.includes(first)));
      setError(`${fieldLabel(first)} girilmeli`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(values);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const renderField = (field: InventoryField) => {
    const column = options.columns.find((c) => c.field === field)!;
    const isRequired = required.includes(field);
    const suggestions = options.suggestions[field] ?? [];
    const missing = isMissing(values, field, required);
    const hint = HINTS[field];

    if (field === 'storageMedium') {
      return (
        <Field key={field} label={column.label} required={isRequired}>
          <div className="actions">
            {(Object.entries(options.storageMedia) as [StorageMedium, string][]).map(([k, label]) => (
              <label className="checkbox" key={k}>
                <input
                  type="radio"
                  name="storageMedium"
                  checked={values.storageMedium === k}
                  onChange={() => set('storageMedium', k)}
                  disabled={readOnly}
                />
                {label}
              </label>
            ))}
          </div>
        </Field>
      );
    }

    if (column.kind === 'list') {
      const f = field as InventoryListField;
      return (
        <div className="field" key={field}>
          <span className={`field-label${isRequired ? ' required' : ''}`}>{column.label}</span>
          {readOnly ? (
            <div>{values[f].length ? values[f].join(', ') : '—'}</div>
          ) : (
            <MultiSelect value={values[f]} onChange={(v) => set(f, v)} options={suggestions} />
          )}
          {missing && !readOnly && <span className="hint">Kaydın tamamlanması için en az bir seçim gerekli.</span>}
        </div>
      );
    }

    const f = field as InventoryTextField;
    const value = values[f] ?? '';
    if (field === 'dataCategory') {
      const info = categoryInfo.get(value);
      return (
        <Field
          key={field}
          label={column.label}
          required
          htmlFor={field}
          hint={info ? `${info.special ? 'Özel nitelikli. ' : ''}Örnekler: ${info.examples}` : 'Listeden seçin veya yazın'}
        >
          <input id={field} list={`${listId}-${field}`} value={value} onChange={(e) => set(f, e.target.value)} disabled={readOnly} />
          <datalist id={`${listId}-${field}`}>
            {suggestions.map((s) => (
              <option key={s} value={s}>
                {categoryInfo.get(s)?.special ? 'Özel nitelikli' : undefined}
              </option>
            ))}
          </datalist>
        </Field>
      );
    }
    return (
      <Field key={field} label={column.label} required={isRequired} htmlFor={field} hint={hint}>
        {LONG_TEXT.includes(field) ? (
          <textarea id={field} value={value} onChange={(e) => set(f, e.target.value)} disabled={readOnly} rows={3} />
        ) : (
          <>
            <input id={field} list={`${listId}-${field}`} value={value} onChange={(e) => set(f, e.target.value)} disabled={readOnly} />
            <datalist id={`${listId}-${field}`}>
              {suggestions.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </>
        )}
      </Field>
    );
  };

  return (
    <form className="form" onSubmit={submit}>
      <div className="steps" role="tablist">
        {STEPS.map((s, i) => (
          <button
            type="button"
            role="tab"
            aria-selected={i === step}
            key={s.title}
            className={`step${i === step ? ' active' : stepMissing(i) ? '' : ' done'}`}
            onClick={() => setStep(i)}
          >
            {s.title}
          </button>
        ))}
      </div>
      <ErrorAlert error={error} />
      {STEPS[step].fields.map(renderField)}
      <div className="actions" style={{ justifyContent: 'space-between', marginTop: 8 }}>
        <div className="actions">
          <button type="button" className="btn" onClick={() => setStep((s) => s - 1)} disabled={step === 0}>
            ← Geri
          </button>
          <button type="button" className="btn" onClick={() => setStep((s) => s + 1)} disabled={step === STEPS.length - 1}>
            İleri →
          </button>
        </div>
        {!readOnly && (
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Kaydediliyor…' : submitLabel}
          </button>
        )}
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        İstediğiniz adımda kaydedebilirsiniz; eksik alanlar envanter listesinde &quot;eksik&quot; olarak görünür.
      </p>
    </form>
  );
}

function stripNulls(v?: Partial<InventoryValues>): Partial<InventoryValues> {
  if (!v) return {};
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(EMPTY) as (keyof InventoryValues)[]) {
    if (v[k] !== null && v[k] !== undefined) out[k] = v[k];
  }
  return out as Partial<InventoryValues>;
}

/** Boş metinler API'ye null olarak gider. */
export function toPayload(v: InventoryValues) {
  return Object.fromEntries(
    Object.entries(v).map(([k, val]) => [k, typeof val === 'string' ? val.trim() || null : val]),
  );
}
