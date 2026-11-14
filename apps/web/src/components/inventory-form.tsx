'use client';

import {
  FOREIGN_TRANSFER,
  NO_FOREIGN_TRANSFER,
  NO_RECIPIENTS,
  RETENTION_UNITS,
  formatRetention,
  parseRetention,
  type InventoryField,
  type InventoryListField,
  type InventoryTextField,
  type RetentionParts,
} from '@kvkk/shared';
import { FormEvent, useId, useMemo, useState } from 'react';
import { fieldLabel } from '@/lib/labels';
import type { InventoryEntry, InventoryOptions } from '@/lib/types';
import { MultiSelect } from './multi-select';
import { ErrorAlert, Field } from './ui';

export type InventoryValues = Pick<
  InventoryEntry,
  InventoryTextField | InventoryListField | 'storageMedium'
>;

/** Seçilen bir veri kategorisi ve o kategoride işlenen veriler. Her kategori ayrı bir envanter satırı olarak kaydedilir. */
interface CategoryData {
  name: string;
  personalData: string;
  specialCategoryData: string;
}

type ForeignMode = '' | 'none' | 'yes' | 'other';

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

/**
 * Adım adım giriş, her seçim ayrı sekmede ve listeler kaydırmasız tam boy (Erdal, 14.11.2026); alanlar Erdal'ın "veri envanteri seçenekleri" Word dosyasındaki sırayla (14.11.2026).
 * Fiziksel/Dijital ve Bulunduğu yer girişten kaldırıldı (Erdal, 14.11.2026); eski satırlardaki değerleri korunur.
 */
const STEPS: { title: string; fields: InventoryField[] }[] = [
  { title: '1. Süreç', fields: ['department', 'activity'] },
  { title: '2. Veri kategorisi', fields: ['dataCategory', 'personalData'] },
  { title: '3. İşleme amacı', fields: ['purposes'] },
  { title: '4. Kişi grupları', fields: ['dataSubjectGroups'] },
  { title: '5. Alıcı grupları', fields: ['recipients'] },
  { title: '6. Hukuki sebep', fields: ['legalBases'] },
  { title: '7. Saklama süresi', fields: ['retentionPeriod'] },
  { title: '8. Yurt dışı aktarım', fields: ['foreignTransfers'] },
  { title: '9. İlgili mevzuat', fields: ['relatedLegislation'] },
  { title: '10. İdari tedbirler', fields: ['administrativeMeasures'] },
  { title: '11. Teknik tedbirler', fields: ['technicalMeasures'] },
];

const PLACEHOLDERS: Partial<Record<InventoryField, string>> = {
  department: 'Genel veya departman adı',
  activity: 'Genel veya faaliyet/süreç adı',
};

/** İlgili mevzuat tek metin sütununda virgülle ayrılmış olarak saklanır. */
const LEGISLATION_SEPARATOR = ', ';
const splitLegislation = (v: string | null | undefined) =>
  (v ?? '')
    .split(LEGISLATION_SEPARATOR)
    .map((s) => s.trim())
    .filter(Boolean);

function parseForeign(v: string | null | undefined): { mode: ForeignMode; text: string } {
  const t = (v ?? '').trim();
  if (!t) return { mode: '', text: '' };
  if (t === NO_FOREIGN_TRANSFER) return { mode: 'none', text: '' };
  if (t.endsWith(FOREIGN_TRANSFER)) return { mode: 'yes', text: '' };
  return { mode: 'other', text: t };
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
  /** Seçilen her veri kategorisi için bir satır; düzenlemede ilk eleman mevcut satırdır. */
  onSubmit: (rows: InventoryValues[]) => Promise<void>;
}) {
  const [values, setValues] = useState<InventoryValues>(() => ({ ...EMPTY, ...stripNulls(initial) }));
  const [categories, setCategories] = useState<CategoryData[]>(() =>
    initial?.dataCategory
      ? [{ name: initial.dataCategory, personalData: initial.personalData ?? '', specialCategoryData: initial.specialCategoryData ?? '' }]
      : [],
  );
  const [retention, setRetention] = useState<RetentionParts>(() => parseRetention(initial?.retentionPeriod));
  const [foreign, setForeign] = useState(() => parseForeign(initial?.foreignTransfers));
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const listId = useId();
  const required = options.requiredFields;

  const categoryInfo = useMemo(
    () => new Map(options.dataCategories.map((c) => [c.name, c])),
    [options.dataCategories],
  );
  const legislationOptions = useMemo(
    () => {
      // Aynı kanunun büyük/küçük harf farkıyla yazılmış eski hali ayrıca gösterilmez.
      const seen = new Set<string>();
      return (options.suggestions.relatedLegislation ?? []).flatMap(splitLegislation).filter((v) => {
        const key = v.toLocaleLowerCase('tr-TR');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    },
    [options.suggestions.relatedLegislation],
  );
  const set = <K extends keyof InventoryValues>(k: K, v: InventoryValues[K]) => setValues((cur) => ({ ...cur, [k]: v }));
  const isSpecial = (c: CategoryData) => categoryInfo.get(c.name)?.special ?? (!!c.specialCategoryData && !c.personalData);

  /** Kaydedilecek satırlar: ortak alanlar + her kategorinin kendi verileri. */
  const rows = (): InventoryValues[] =>
    categories.map((c) => ({
      ...values,
      dataCategory: c.name,
      personalData: c.personalData,
      specialCategoryData: c.specialCategoryData,
      retentionPeriod: formatRetention(retention),
      foreignTransfers:
        foreign.mode === 'none'
          ? NO_FOREIGN_TRANSFER
          : foreign.mode === 'yes'
            ? `${c.name}: ${FOREIGN_TRANSFER}`
            : foreign.mode === 'other'
              ? foreign.text
              : '',
    }));

  const isMissing = (field: InventoryField): boolean => {
    if (field === 'dataCategory') return categories.length === 0;
    if (field === 'personalData') return categories.some((c) => !c.personalData.trim() && !c.specialCategoryData.trim());
    if (!required.includes(field)) return false;
    if (field === 'retentionPeriod') return !formatRetention(retention);
    const v = values[field];
    return Array.isArray(v) ? v.length === 0 : !v || (typeof v === 'string' && !v.trim());
  };
  const stepMissing = (i: number) => STEPS[i].fields.some(isMissing);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const first = (['department', 'activity'] as const).find((f) => !values[f].trim());
    if (first) {
      setStep(0);
      setError(`${fieldLabel(first)} girilmeli`);
      return;
    }
    if (categories.length === 0) {
      setStep(1);
      setError('En az bir veri kategorisi seçilmeli');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(rows());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const toggleCategory = (name: string) =>
    setCategories((cur) =>
      cur.some((c) => c.name === name)
        ? cur.filter((c) => c.name !== name)
        : [...cur, { name, personalData: '', specialCategoryData: '' }],
    );
  const setCategoryData = (name: string, key: 'personalData' | 'specialCategoryData', v: string) =>
    setCategories((cur) => cur.map((c) => (c.name === name ? { ...c, [key]: v } : c)));

  const renderCategories = () => {
    if (readOnly) {
      return (
        <div className="field" key="dataCategory">
          <span className="field-label">Veri kategorisi</span>
          {categories.map((c) => (
            <div key={c.name}>
              <strong>{c.name}</strong>: {[c.personalData, c.specialCategoryData].filter(Boolean).join(' / ') || '—'}
            </div>
          ))}
        </div>
      );
    }
    const templateNames = options.dataCategories.map((c) => c.name);
    // Şablonda olmayan eski kategori adları (ör. Excel'den aktarılan) seçili olarak üstte görünür.
    const legacy = categories.filter((c) => !templateNames.includes(c.name)).map((c) => c.name);
    const groups: { title: string; names: string[] }[] = [
      ...(legacy.length ? [{ title: 'Bu satırdaki kategori', names: legacy }] : []),
      { title: 'Kişisel veri', names: options.dataCategories.filter((c) => !c.special).map((c) => c.name) },
      { title: 'Özel nitelikli kişisel veri', names: options.dataCategories.filter((c) => c.special).map((c) => c.name) },
    ];
    const renderOne = (name: string) => {
      const selected = categories.find((c) => c.name === name);
      const info = categoryInfo.get(name);
      const special = selected ? isSpecial(selected) : !!info?.special;
      const main = special ? 'specialCategoryData' : 'personalData';
      const other = special ? 'personalData' : 'specialCategoryData';
      const inputId = `${listId}-cat-${name}`;
      return (
        <div key={name}>
          <label className="checkbox">
            <input type="checkbox" checked={!!selected} onChange={() => toggleCategory(name)} />
            <span>{name}</span>
          </label>
          {selected && (
            <div className="cat-data">
              <input
                id={inputId}
                aria-label={`${name}: işlenen veriler`}
                value={selected[main]}
                placeholder={info?.examples || 'İşlenen verileri yazın'}
                onChange={(e) => setCategoryData(name, main, e.target.value)}
              />
              {selected[other] && (
                <input
                  aria-label={`${name}: ${special ? 'kişisel veriler' : 'özel nitelikli veriler'}`}
                  value={selected[other]}
                  style={{ marginTop: 4 }}
                  onChange={(e) => setCategoryData(name, other, e.target.value)}
                />
              )}
            </div>
          )}
        </div>
      );
    };
    return (
      <div className="field" key="dataCategory">
        <span className="field-label required">Veri kategorisi</span>
        <span className="hint" style={{ marginTop: 0 }}>
          Birden çok kategori seçebilirsiniz; seçtiğiniz her kategori envantere ayrı bir satır olarak kaydedilir. Kategoriyi
          seçince altındaki alana o kategoride işlenen verileri yazın (örnekler alanın içinde görünür).
        </span>
        <div className="multi">
          <div className="multi-chips">
            {categories.length === 0 && <span className="muted small">Henüz seçim yok</span>}
            {categories.map((c) => (
              <span className="chip" key={c.name}>
                {c.name}
                <button type="button" aria-label={`${c.name} kaldır`} onClick={() => toggleCategory(c.name)}>
                  ×
                </button>
              </span>
            ))}
          </div>
          <div className="multi-options">
            {groups.map((g) => (
              <div key={g.title}>
                <div className="small muted" style={{ fontWeight: 600, margin: '6px 0 2px' }}>
                  {g.title}
                </div>
                {g.names.map(renderOne)}
              </div>
            ))}
          </div>
        </div>
        {isMissing('personalData') && (
          <span className="hint">Seçilen her kategori için işlenen veriler yazılmalı; boş kalan satır eksik görünür.</span>
        )}
      </div>
    );
  };

  const renderRetention = () => (
    <Field key="retentionPeriod" label="Veri saklama süresi" required={required.includes('retentionPeriod')} hint="Rakamla süre, birim ve gerekirse açıklama; ör. 10 yıl, işten ayrılıştan itibaren">
      {readOnly ? (
        <div>{formatRetention(retention) || '—'}</div>
      ) : (
        <div className="retention">
          <input
            type="number"
            min={0}
            aria-label="Süre (rakamla)"
            placeholder="Süre"
            value={retention.amount}
            onChange={(e) => setRetention((r) => ({ ...r, amount: e.target.value.replace(/\D/g, '') }))}
          />
          <select aria-label="Birim" value={retention.unit} onChange={(e) => setRetention((r) => ({ ...r, unit: e.target.value as RetentionParts['unit'] }))}>
            {RETENTION_UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
          <input
            className="grow"
            aria-label="Açıklama"
            placeholder="Açıklama"
            value={retention.description}
            onChange={(e) => setRetention((r) => ({ ...r, description: e.target.value }))}
          />
        </div>
      )}
    </Field>
  );

  const renderForeign = () => {
    const names = categories.map((c) => c.name).join(', ') || 'seçilen veri kategorisi';
    const choices: { mode: ForeignMode; label: string }[] = [
      { mode: 'none', label: NO_FOREIGN_TRANSFER },
      { mode: 'yes', label: `${names}: ${FOREIGN_TRANSFER}` },
      ...(foreign.mode === 'other' ? [{ mode: 'other' as const, label: 'Açıklama (önceki kayıt)' }] : []),
    ];
    return (
      <div className="field" key="foreignTransfers">
        <span className="field-label">Yabancı ülkelere aktarılacak bilgiler</span>
        {choices.map((c) => (
          <label className="checkbox" key={c.mode}>
            <input
              type="radio"
              name={`${listId}-foreign`}
              checked={foreign.mode === c.mode}
              onChange={() => setForeign((f) => ({ ...f, mode: c.mode }))}
              disabled={readOnly}
            />
            <span>{c.label}</span>
          </label>
        ))}
        {foreign.mode === 'other' && (
          <textarea
            rows={3}
            value={foreign.text}
            onChange={(e) => setForeign({ mode: 'other', text: e.target.value })}
            disabled={readOnly}
          />
        )}
      </div>
    );
  };

  const renderField = (field: InventoryField) => {
    if (field === 'dataCategory') return renderCategories();
    if (field === 'personalData') return null;
    if (field === 'retentionPeriod') return renderRetention();
    if (field === 'foreignTransfers') return renderForeign();

    const column = options.columns.find((c) => c.field === field)!;
    const isRequired = required.includes(field);
    const suggestions = options.suggestions[field] ?? [];

    if (field === 'relatedLegislation') {
      const list = splitLegislation(values.relatedLegislation);
      return (
        <div className="field" key={field}>
          <span className="field-label">{column.label}</span>
          {readOnly ? (
            <div>{list.length ? list.join(', ') : '—'}</div>
          ) : (
            <MultiSelect
              value={list}
              onChange={(v) => set('relatedLegislation', v.join(LEGISLATION_SEPARATOR))}
              options={legislationOptions}
            />
          )}
        </div>
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
            <MultiSelect
              value={values[f]}
              onChange={(v) => set(f, v)}
              options={f === 'recipients' ? suggestions.filter((s) => s !== NO_RECIPIENTS) : suggestions}
              exclusive={f === 'recipients' ? NO_RECIPIENTS : undefined}
            />
          )}
          {isMissing(field) && !readOnly && <span className="hint">Kaydın tamamlanması için en az bir seçim gerekli.</span>}
        </div>
      );
    }

    const f = field as InventoryTextField;
    const value = values[f] ?? '';
    return (
      <Field key={field} label={column.label} required={isRequired} htmlFor={field}>
        <input
          id={field}
          list={`${listId}-${field}`}
          value={value}
          placeholder={PLACEHOLDERS[field]}
          onChange={(e) => set(f, e.target.value)}
          disabled={readOnly}
        />
        <datalist id={`${listId}-${field}`}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
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
