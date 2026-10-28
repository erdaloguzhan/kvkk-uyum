'use client';

import {
  EMPTY_INCIDENT_FORM,
  INCIDENT_CYBER_ELEMENTS,
  INCIDENT_CYBER_IMPACTS,
  INCIDENT_CYBER_RECOVERIES,
  INCIDENT_FIELD_LABELS as L,
  INCIDENT_LIKELIHOODS,
  INCIDENT_ORG_IMPACTS,
  INCIDENT_PERSONAL_DATA_CATEGORIES,
  INCIDENT_RECOVERIES,
  INCIDENT_SOURCES,
  INCIDENT_SPECIAL_DATA_CATEGORIES,
  INCIDENT_SUBJECT_EFFECTS,
  INCIDENT_SUBJECT_GROUPS,
  INCIDENT_SUBJECT_NOTICES,
  IncidentForm,
  IncidentNotificationType,
} from '@kvkk/shared';
import { FormEvent, ReactNode, useId, useState } from 'react';
import { errorText } from '@/lib/api';
import type { Incident } from '@/lib/types';
import { ErrorAlert, Field } from './ui';

export interface IncidentValues {
  title: string;
  occurredAt: string;
  detectedAt: string;
  followUpRef: string;
  form: IncidentForm;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** ISO tarih-saati <input type="datetime-local"> değerine (tarayıcının yerel saati) çevirir. */
export function toLocalInput(iso: string | null | undefined) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

export function incidentValues(i?: Incident, defaults?: Partial<IncidentForm>): IncidentValues {
  return {
    title: i?.title ?? '',
    occurredAt: toLocalInput(i?.occurredAt),
    detectedAt: toLocalInput(i?.detectedAt),
    followUpRef: i?.followUpRef ?? '',
    form: { ...EMPTY_INCIDENT_FORM, ...defaults, ...i?.form },
  };
}

/** Boş metinler API'ye null olarak gider (API de aynı dönüşümü yapar). */
export function toIncidentPayload(v: IncidentValues) {
  return {
    title: v.title.trim(),
    occurredAt: fromLocalInput(v.occurredAt),
    detectedAt: fromLocalInput(v.detectedAt),
    followUpRef: v.followUpRef.trim() || null,
    form: v.form,
  };
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="incident-section">
      <h2>{title}</h2>
      <div className="form">{children}</div>
    </section>
  );
}

function CheckGroup({
  options,
  value,
  onChange,
  columns,
}: {
  options: readonly string[];
  value: string[];
  onChange: (v: string[]) => void;
  columns?: boolean;
}) {
  const id = useId();
  const toggle = (o: string) => onChange(value.includes(o) ? value.filter((v) => v !== o) : [...value, o]);
  return (
    <div className={columns ? 'check-grid' : 'check-list'}>
      {options.map((o, i) => (
        <label className="checkbox" key={o} htmlFor={`${id}-${i}`}>
          <input id={`${id}-${i}`} type="checkbox" checked={value.includes(o)} onChange={() => toggle(o)} />
          <span>{o}</span>
        </label>
      ))}
    </div>
  );
}

function RadioGroup<K extends string>({
  options,
  value,
  onChange,
  inline,
}: {
  options: Record<K, string | { label: string; description: string }>;
  value: K | null;
  onChange: (v: K | null) => void;
  inline?: boolean;
}) {
  const name = useId();
  return (
    <div className={inline ? 'check-inline' : 'check-list'}>
      {(Object.entries(options) as [K, string | { label: string; description: string }][]).map(([key, o]) => {
        const label = typeof o === 'string' ? o : o.label;
        const description = typeof o === 'string' ? '' : o.description;
        return (
          <label className="checkbox" key={key}>
            <input type="radio" name={name} checked={value === key} onChange={() => onChange(key)} />
            <span>
              <strong style={{ fontWeight: description ? 600 : 400 }}>{label}</strong>
              {description && <span className="muted small"> · {description}</span>}
            </span>
          </label>
        );
      })}
      {value !== null && (
        <button type="button" className="btn-link small" onClick={() => onChange(null)} style={{ justifySelf: 'start' }}>
          Seçimi temizle
        </button>
      )}
    </div>
  );
}

const YES_NO = { yes: 'Evet', no: 'Hayır' } as const;
const toYesNo = (v: boolean | null) => (v === null ? null : v ? 'yes' : 'no');
const fromYesNo = (v: 'yes' | 'no' | null) => (v === null ? null : v === 'yes');

/**
 * FRM-020 "KVK Veri İhlal Kayıt ve Bildirim Formu"nun A–E bölümleri. Soru metinleri ve seçenekler formdan
 * alınmıştır; doldurulan kayıttan aynı düzende Word bildirim formu üretilir.
 */
export function IncidentFormFields({
  initial,
  notificationType,
  readOnly,
  submitLabel,
  onSubmit,
}: {
  initial: IncidentValues;
  notificationType: IncidentNotificationType;
  readOnly?: boolean;
  submitLabel: string;
  onSubmit: (values: IncidentValues) => Promise<void>;
}) {
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const f = values.form;
  const set = <K extends keyof IncidentValues>(key: K, value: IncidentValues[K]) => setValues((v) => ({ ...v, [key]: value }));
  const setF = <K extends keyof IncidentForm>(key: K, value: IncidentForm[K]) =>
    setValues((v) => ({ ...v, form: { ...v.form, [key]: value } }));
  const text = (key: keyof IncidentForm) => ({
    id: key,
    value: (f[key] as string | null) ?? '',
    onChange: (e: { target: { value: string } }) => setF(key, (e.target.value || null) as never),
  });
  const count = (key: 'estimatedPeople' | 'estimatedRecords') => ({
    id: key,
    type: 'number',
    min: 0,
    step: 1,
    value: f[key] ?? '',
    onChange: (e: { target: { value: string } }) => setF(key, e.target.value === '' ? null : Math.max(0, Math.floor(Number(e.target.value)))),
  });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit(values);
    } catch (err) {
      setError(errorText(err));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <ErrorAlert error={error} />
      <fieldset disabled={readOnly} className="plain-fieldset">
        <Section title="Olay kaydı">
          <Field label={L.title} htmlFor="title" required hint="Listede görünen kısa ad; bildirim formuna yazılmaz.">
            <input id="title" value={values.title} onChange={(e) => set('title', e.target.value)} required maxLength={300} />
          </Field>
          <div className="form-row">
            <Field label={L.occurredAt} htmlFor="occurredAt">
              <input
                id="occurredAt"
                type="datetime-local"
                value={values.occurredAt}
                max={values.detectedAt || undefined}
                onChange={(e) => set('occurredAt', e.target.value)}
              />
            </Field>
            <Field label={L.detectedAt} htmlFor="detectedAt" required hint="Kurula 72 saatlik bildirim süresi bu andan başlar.">
              <input id="detectedAt" type="datetime-local" value={values.detectedAt} onChange={(e) => set('detectedAt', e.target.value)} required />
            </Field>
          </div>
          {notificationType === 'follow_up' && (
            <Field label="Takip numarası" htmlFor="followUpRef" hint="Takip Bildirimlerinde varsa takip numarasını ekleyiniz.">
              <input id="followUpRef" value={values.followUpRef} onChange={(e) => set('followUpRef', e.target.value)} maxLength={200} />
            </Field>
          )}
        </Section>

        <Section title="A) Hakkınızda">
          <div className="form-row">
            <Field label={L.controllerName} htmlFor="controllerName">
              <input {...text('controllerName')} maxLength={500} />
            </Field>
            <Field label={L.controllerAddress} htmlFor="controllerAddress">
              <input {...text('controllerAddress')} maxLength={1000} />
            </Field>
          </div>
          <div className="form-row">
            <Field label={L.preparerName} htmlFor="preparerName">
              <input {...text('preparerName')} maxLength={200} />
            </Field>
            <Field label={L.preparerTitle} htmlFor="preparerTitle">
              <input {...text('preparerTitle')} maxLength={200} />
            </Field>
          </div>
          <div className="form-row">
            <Field label={L.preparerEmail} htmlFor="preparerEmail">
              <input {...text('preparerEmail')} type="email" maxLength={254} />
            </Field>
            <Field label={L.preparerPhone} htmlFor="preparerPhone">
              <input {...text('preparerPhone')} type="tel" maxLength={50} />
            </Field>
          </div>
        </Section>

        <Section title="B) İhlal hakkında">
          <Field label="İhlal hakkında bilgi veriniz." htmlFor="description" required>
            <textarea {...text('description')} maxLength={5000} rows={5} />
          </Field>
          <Field label="İhlalin kaynağı" required hint="Birden çok uyan seçenek bulunması halinde hepsini işaretleyiniz.">
            <CheckGroup options={INCIDENT_SOURCES} value={f.sources} onChange={(v) => setF('sources', v)} columns />
          </Field>
          <Field label="Diğer (Cevabınızı detaylandırınız)" htmlFor="sourceOther">
            <input {...text('sourceOther')} maxLength={1000} />
          </Field>
          <div className="field">
            <span className="field-label required">İhlalden etkilenen kişisel veri kategorileri</span>
            <span className="hint">Birden çok uyan seçenek bulunması halinde hepsini işaretleyiniz.</span>
            <div className="grid grid-2">
              <div>
                <strong className="small">Kişisel Veri</strong>
                <CheckGroup options={INCIDENT_PERSONAL_DATA_CATEGORIES} value={f.personalCategories} onChange={(v) => setF('personalCategories', v)} />
              </div>
              <div>
                <strong className="small">Özel Nitelikli Kişisel Veri</strong>
                <CheckGroup options={INCIDENT_SPECIAL_DATA_CATEGORIES} value={f.specialCategories} onChange={(v) => setF('specialCategories', v)} />
              </div>
            </div>
          </div>
          <Field label="Diğer (Detayları belirtiniz)" htmlFor="categoryOther">
            <input {...text('categoryOther')} maxLength={1000} />
          </Field>
          <div className="form-row">
            <Field label="Tahmini Kişi Sayısı" htmlFor="estimatedPeople">
              <input {...count('estimatedPeople')} />
            </Field>
            <Field label="Tahmini Kayıt Sayısı" htmlFor="estimatedRecords">
              <input {...count('estimatedRecords')} />
            </Field>
          </div>
          <div className="grid grid-2">
            <Field label="İlgili Kişi Grupları" hint="Birden çok uyan seçenek bulunması halinde hepsini işaretleyiniz.">
              <CheckGroup options={INCIDENT_SUBJECT_GROUPS} value={f.subjectGroups} onChange={(v) => setF('subjectGroups', v)} />
              <input {...text('subjectGroupOther')} placeholder="Diğer (Detayları belirtiniz)" aria-label="Diğer kişi grubu" maxLength={1000} />
            </Field>
            <Field label="İlgili Kişiler Üzerindeki Etkileri">
              <CheckGroup options={INCIDENT_SUBJECT_EFFECTS} value={f.subjectEffects} onChange={(v) => setF('subjectEffects', v)} />
              <input {...text('subjectEffectOther')} placeholder="Diğer (Detayları belirtiniz)" aria-label="Diğer etki" maxLength={1000} />
            </Field>
          </div>
          {notificationType === 'initial' && (
            <Field
              label="Bildirimin yapılmasında herhangi bir gecikme yaşandıysa sebebini açıklayınız."
              htmlFor="delayReason"
              hint="Yalnızca ilk bildirimler için. 72 saat geçtiyse onaya göndermeden önce doldurulmalı."
            >
              <textarea {...text('delayReason')} maxLength={5000} />
            </Field>
          )}
        </Section>

        <Section title="C) Olası sonuçlar">
          <Field
            label="İhlalin potansiyel etkileri hakkında bilgi veriniz."
            htmlFor="potentialEffects"
            hint="İhlalin ilgili kişiler üzerinde doğurabileceği etkileri tarif ediniz. Eğer halihazırda ilgili kişiler üzerinde bir zarar meydana geldiyse belirtiniz."
          >
            <textarea {...text('potentialEffects')} maxLength={5000} />
          </Field>
          <Field label="İhlal sebebiyle ilgili kişilerin önemli olumsuz etkilere maruz kalma olasılığı" required>
            <RadioGroup options={INCIDENT_LIKELIHOODS} value={f.likelihood} onChange={(v) => setF('likelihood', v)} inline />
            {f.likelihood === 'unknown' && (
              <input {...text('likelihoodDetail')} placeholder="Cevabınızı detaylandırınız" aria-label="Olasılık açıklaması" maxLength={1000} />
            )}
          </Field>
          <Field label="İhlalin organizasyonunuza olan etkileri">
            <RadioGroup options={INCIDENT_ORG_IMPACTS} value={f.orgImpact} onChange={(v) => setF('orgImpact', v)} />
          </Field>
          <Field label="İyileşme zamanı ile ilgili bilgiler">
            <RadioGroup options={INCIDENT_RECOVERIES} value={f.orgRecovery} onChange={(v) => setF('orgRecovery', v)} />
          </Field>
        </Section>

        <Section title="D) Varsa siber saldırıya özgü sonuçlar">
          <Field label="Bilgi sistemleriniz siber saldırıdan etkilendi mi?">
            <RadioGroup options={YES_NO} value={toYesNo(f.cyberAttack)} onChange={(v) => setF('cyberAttack', fromYesNo(v))} inline />
          </Field>
          {f.cyberAttack && (
            <>
              <Field label="Siber saldırı sonucu gerçekleşen ihlal unsuru" hint="Birden çok uyan seçenek bulunması halinde hepsini işaretleyiniz.">
                <CheckGroup options={INCIDENT_CYBER_ELEMENTS} value={f.cyberElements} onChange={(v) => setF('cyberElements', v)} columns />
                <input {...text('cyberElementOther')} placeholder="Diğer (Cevabınızı detaylandırınız)" aria-label="Diğer ihlal unsuru" maxLength={1000} />
              </Field>
              <Field label="Siber saldırıların organizasyonunuza olan etkileri">
                <RadioGroup options={INCIDENT_CYBER_IMPACTS} value={f.cyberImpact} onChange={(v) => setF('cyberImpact', v)} />
              </Field>
              <Field label="İyileşme zamanı ile ilgili bilgiler">
                <RadioGroup options={INCIDENT_CYBER_RECOVERIES} value={f.cyberRecovery} onChange={(v) => setF('cyberRecovery', v)} />
              </Field>
            </>
          )}
        </Section>

        <Section title="E) Önlemler">
          <Field label="İhlal ile ilgili olan çalışanlar son bir yıl içerisinde kişisel veri koruma eğitimi aldı mı?">
            <RadioGroup options={YES_NO} value={toYesNo(f.staffTrained)} onChange={(v) => setF('staffTrained', fromYesNo(v))} inline />
          </Field>
          <Field
            label="Bu tür ihlalleri engellemek için ihlalin gerçekleşmesinden önce almış olduğunuz idari ve teknik tedbirlerini belirtiniz."
            htmlFor="measuresBefore"
          >
            <textarea {...text('measuresBefore')} maxLength={5000} />
          </Field>
          <Field
            label="İhlalin sonucu olarak almış olduğunuz veya almayı planladığınız idari ve teknik tedbirleri belirtiniz."
            htmlFor="measuresAfter"
            hint="Örneğin yanlışlıkla gönderilmiş olan verilerin yok edilmesi, parolaların güvenliğinin sağlanması, veri güvenliği eğitimi planlanması vb."
          >
            <textarea {...text('measuresAfter')} maxLength={5000} />
          </Field>
          <Field
            label="İhlalin tekrarlanmaması için atılan adımlar ve bunların tahminen ne zaman tamamlanacağı hakkında bilgi veriniz."
            htmlFor="recurrenceSteps"
          >
            <textarea {...text('recurrenceSteps')} maxLength={5000} />
          </Field>
          <Field label="İlgili kişilere ihlal bildirimi yapıldı mı?">
            <RadioGroup options={INCIDENT_SUBJECT_NOTICES} value={f.subjectNotice} onChange={(v) => setF('subjectNotice', v)} />
          </Field>
          <Field label="İlgili kişilere hangi yöntemle bildirim yapıldığı/yapılacağı hakkında detaylı bilgi veriniz." htmlFor="subjectNoticeMethod">
            <textarea {...text('subjectNoticeMethod')} maxLength={5000} />
          </Field>
          <Field
            label="İlgili kişilerin veri ihlali ile ilgili bilgi almalarını sağlayacak kişinin adı-soyadı ve iletişim bilgisi ya da veri sorumlusu web adresi"
            htmlFor="subjectContact"
          >
            <input {...text('subjectContact')} maxLength={1000} />
          </Field>
          <Field
            label="Yurtiçinde bulunan diğer organizasyon veya kurumlara ihlal hakkında bilgi verildi mi veya vermeyi düşünüyor musunuz?"
            hint="Örn. polis, diğer denetim ya da gözetim kurumları."
          >
            <RadioGroup options={YES_NO} value={toYesNo(f.domesticInformed)} onChange={(v) => setF('domesticInformed', fromYesNo(v))} inline />
            {f.domesticInformed && <textarea {...text('domesticDetail')} placeholder="Açıklayınız" aria-label="Yurtiçi açıklama" maxLength={5000} />}
          </Field>
          <Field
            label="Yurtdışında bulunan diğer veri koruma otoriteleri veya ilgili kurumlara ihlal hakkında bilgi verildi mi veya vermeyi düşünüyor musunuz?"
            hint="Örn. polis, diğer denetim ya da gözetim kurumları."
          >
            <RadioGroup options={YES_NO} value={toYesNo(f.foreignInformed)} onChange={(v) => setF('foreignInformed', fromYesNo(v))} inline />
            {f.foreignInformed && <textarea {...text('foreignDetail')} placeholder="Açıklayınız" aria-label="Yurtdışı açıklama" maxLength={5000} />}
          </Field>
        </Section>
      </fieldset>
      {!readOnly && (
        <div className="form-footer">
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Kaydediliyor…' : submitLabel}
          </button>
          <span className="small muted">Kayıt istediğiniz kadar ara kaydedilebilir; eksikler onaya gönderirken kontrol edilir.</span>
        </div>
      )}
    </form>
  );
}
