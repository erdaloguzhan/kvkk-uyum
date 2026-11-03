'use client';

import {
  EMPTY_INCIDENT_FORM,
  INCIDENT_BREACH_EFFECTS,
  INCIDENT_CYBER_SOURCES,
  INCIDENT_FIELD_LABELS as L,
  INCIDENT_LIKELIHOODS,
  INCIDENT_ORG_IMPACTS,
  INCIDENT_PERSONAL_DATA_CATEGORIES,
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
  endedAt: string;
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
    endedAt: toLocalInput(i?.endedAt),
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
    endedAt: fromLocalInput(v.endedAt),
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
const MULTI = 'Birden çok uyan seçenek bulunması halinde hepsini işaretleyiniz.';
const ATTACH = 'Varsa tevsik edici belgeleri bildirimin ekinde gönderiniz.';
const toYesNo = (v: boolean | null) => (v === null ? null : v ? 'yes' : 'no');
const fromYesNo = (v: 'yes' | 'no' | null) => (v === null ? null : v === 'yes');

/**
 * FRM-020 "KVK Veri İhlal Kayıt ve Bildirim Formu"nun A–D bölümleri (31 soru, numaralar formdaki gibi). Soru metinleri ve seçenekler formdan
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
  /** Form içindeki tarih-saatler (13. soru) ISO metin olarak tutulur. */
  const dateTime = (key: 'processorDetectedAt' | 'processorNotifiedAt') => ({
    id: key,
    type: 'datetime-local',
    value: toLocalInput(f[key]),
    onChange: (e: { target: { value: string } }) => setF(key, fromLocalInput(e.target.value)),
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
        <div className="alert alert-warning small">
          Formu doldururken ihlale konu olan herhangi bir kişisel veriyi bu forma dahil etmeyiniz.
        </div>
        <Section title="Olay kaydı">
          <Field label={L.title} htmlFor="title" required hint="Listede görünen kısa ad; bildirim formuna yazılmaz.">
            <input id="title" value={values.title} onChange={(e) => set('title', e.target.value)} required maxLength={300} />
          </Field>
        </Section>

        <Section title="A) Hakkınızda">
          <div className="form-row">
            <Field label={`1. ${L.controllerName}`} htmlFor="controllerName">
              <input {...text('controllerName')} maxLength={500} />
            </Field>
            <Field label={`2. ${L.controllerAddress}`} htmlFor="controllerAddress">
              <input {...text('controllerAddress')} maxLength={1000} />
            </Field>
          </div>
          <div className="form-row">
            <Field label={`3. ${L.controllerWebsite}`} htmlFor="controllerWebsite">
              <input {...text('controllerWebsite')} maxLength={500} />
            </Field>
            <Field label={`4. ${L.controllerEmail}`} htmlFor="controllerEmail">
              <input {...text('controllerEmail')} type="email" maxLength={254} />
            </Field>
          </div>
          <p className="small muted">5., 6. ve 7. maddeler sadece Türkiye’de yerleşik veri sorumluları tarafından doldurulur.</p>
          <div className="form-row form-row-3">
            <Field label={`5. ${L.controllerTaxId}`} htmlFor="controllerTaxId">
              <input {...text('controllerTaxId')} maxLength={20} />
            </Field>
            <Field label={`6. ${L.controllerKep}`} htmlFor="controllerKep">
              <input {...text('controllerKep')} maxLength={254} />
            </Field>
            <Field label={`7. ${L.controllerUets}`} htmlFor="controllerUets">
              <input {...text('controllerUets')} maxLength={254} />
            </Field>
          </div>
          <div className="field">
            <span className="field-label">8. Veri sorumlusu adına bu bildirimi hazırlayan kişinin:</span>
            <span className="hint">
              Bildirim veri sorumlusu adına başka bir gerçek veya tüzel kişi tarafından dolduruluyorsa tevsik edici belgeleri (sözleşme, vekâletname vb.) ekleyiniz.
            </span>
          </div>
          <div className="form-row">
            <Field label="Adı ve Soyadı" htmlFor="preparerName">
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
          <Field label={L.preparerAddress} htmlFor="preparerAddress">
            <input {...text('preparerAddress')} maxLength={1000} />
          </Field>
        </Section>

        <Section title="B) İhlal hakkında">
          {notificationType === 'follow_up' && (
            <Field label="9. Bildirim türü: Takip bildirimi · Takip No" htmlFor="followUpRef">
              <input id="followUpRef" value={values.followUpRef} onChange={(e) => set('followUpRef', e.target.value)} maxLength={200} />
            </Field>
          )}
          <div className="form-row form-row-3">
            <Field label={`10. ${L.occurredAt}`} htmlFor="occurredAt">
              <input
                id="occurredAt"
                type="datetime-local"
                value={values.occurredAt}
                max={values.detectedAt || undefined}
                onChange={(e) => set('occurredAt', e.target.value)}
              />
            </Field>
            <Field label={`11. ${L.endedAt}`} htmlFor="endedAt" hint="İhlal devam ediyorsa boş bırakın.">
              <input
                id="endedAt"
                type="datetime-local"
                value={values.endedAt}
                min={values.occurredAt || undefined}
                onChange={(e) => set('endedAt', e.target.value)}
              />
            </Field>
            <Field label={`12. ${L.detectedAt}`} htmlFor="detectedAt" required hint="Kurula 72 saatlik bildirim süresi bu andan başlar.">
              <input id="detectedAt" type="datetime-local" value={values.detectedAt} onChange={(e) => set('detectedAt', e.target.value)} required />
            </Field>
          </div>
          <div className="field">
            <span className="field-label">13. İhlal veri işleyen tarafından veri sorumlusuna bildirildiyse</span>
            <span className="hint">Yazı, e-posta mesajı vb. tevsik edici belgeleri bildirimin ekinde gönderiniz. Veri işleyen yoksa boş bırakın.</span>
          </div>
          <div className="form-row">
            <Field label={L.processorName} htmlFor="processorName">
              <input {...text('processorName')} maxLength={500} />
            </Field>
            <Field label={L.processorAddress} htmlFor="processorAddress">
              <input {...text('processorAddress')} maxLength={1000} />
            </Field>
          </div>
          <div className="form-row">
            <Field label={L.processorDetectedAt} htmlFor="processorDetectedAt">
              <input {...dateTime('processorDetectedAt')} />
            </Field>
            <Field label={L.processorNotifiedAt} htmlFor="processorNotifiedAt">
              <input {...dateTime('processorNotifiedAt')} />
            </Field>
          </div>
          <div className="field">
            <span className="field-label required">14. İhlalin kaynağı ve nasıl gerçekleştiği hakkında bilgi veriniz.</span>
            <span className="hint">{MULTI}</span>
            <div className="grid grid-2">
              <CheckGroup options={INCIDENT_SOURCES} value={f.sources} onChange={(v) => setF('sources', v)} />
              <CheckGroup options={INCIDENT_CYBER_SOURCES} value={f.cyberSources} onChange={(v) => setF('cyberSources', v)} />
            </div>
          </div>
          <Field label="Cevabınızı detaylı bir şekilde açıklayınız" htmlFor="description" required>
            <textarea {...text('description')} maxLength={5000} rows={5} />
          </Field>
          <Field label="15. İhlal etkisini belirtiniz." hint={MULTI}>
            <CheckGroup options={INCIDENT_BREACH_EFFECTS} value={f.breachEffects} onChange={(v) => setF('breachEffects', v)} columns />
            <textarea {...text('breachEffectDetail')} placeholder="Cevabınızı detaylandırınız" aria-label="İhlal etkisi açıklaması" maxLength={5000} />
          </Field>
          <Field label="16. İhlalin nasıl tespit edildiği hakkında bilgi veriniz." htmlFor="detectionMethod" hint={ATTACH}>
            <textarea {...text('detectionMethod')} maxLength={5000} />
          </Field>
          <div className="field">
            <span className="field-label required">17. İhlalden etkilenen kişisel veri kategorileri</span>
            <span className="hint">{MULTI}</span>
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
            <textarea {...text('categoryDetail')} placeholder="Cevabınızı detaylandırınız" aria-label="Veri kategorileri açıklaması" maxLength={5000} />
          </div>
          <div className="field">
            <span className="field-label">18. İhlalden etkilenen kişi ve kayıt sayısı</span>
          </div>
          <div className="form-row">
            <Field label={L.estimatedPeople} htmlFor="estimatedPeople">
              <input {...count('estimatedPeople')} />
            </Field>
            <Field label={L.estimatedRecords} htmlFor="estimatedRecords">
              <input {...count('estimatedRecords')} />
            </Field>
          </div>
          <Field
            label="Kişi ve/veya kayıt sayıları tahmini ise kesin sayıların tespit edilememe nedenini açıklayınız."
            htmlFor="countNote"
          >
            <textarea {...text('countNote')} maxLength={5000} />
          </Field>
          <div className="field">
            <span className="field-label">19. İhlalden etkilenen ilgili kişi grupları ve etkileri</span>
            <span className="hint">{MULTI}</span>
          </div>
          <div className="grid grid-2">
            <Field label="İlgili Kişi Grupları">
              <CheckGroup options={INCIDENT_SUBJECT_GROUPS} value={f.subjectGroups} onChange={(v) => setF('subjectGroups', v)} />
              <input {...text('subjectGroupOther')} placeholder="Diğer (Belirtiniz)" aria-label="Diğer kişi grubu" maxLength={1000} />
            </Field>
            <Field label="İlgili Kişiler Üzerindeki Etkileri">
              <CheckGroup options={INCIDENT_SUBJECT_EFFECTS} value={f.subjectEffects} onChange={(v) => setF('subjectEffects', v)} />
              <input {...text('subjectEffectOther')} placeholder="Diğer (Belirtiniz)" aria-label="Diğer etki" maxLength={1000} />
            </Field>
          </div>
        </Section>

        <Section title="C) Bildirim">
          {notificationType === 'initial' && (
            <Field
              label="20. Kurula bildirimde tespit tarihinden sonra 72 saat geçirilmiş ise geç bildirimin sebebini açıklayınız."
              htmlFor="delayReason"
              hint="Yalnızca ilk bildirimler için. 72 saat geçtiyse onaya göndermeden önce doldurulmalı."
            >
              <textarea {...text('delayReason')} maxLength={5000} />
            </Field>
          )}
          <Field label="21. İlgili kişilere bildirim yapıldı mı?">
            <RadioGroup options={INCIDENT_SUBJECT_NOTICES} value={f.subjectNotice} onChange={(v) => setF('subjectNotice', v)} />
            <textarea {...text('subjectNoticeDetail')} placeholder="Cevabınızı detaylandırınız" aria-label="İlgili kişilere bildirim açıklaması" maxLength={5000} />
          </Field>
          <Field label="22. İlgili kişilere yapılan/yapılacak bildirimin tarihi" htmlFor="subjectNoticeDate">
            <input {...text('subjectNoticeDate')} type="date" />
          </Field>
          <Field
            label="23. İlgili kişilere hangi yöntemle bildirim yapıldığı/yapılacağı hakkında detaylı bilgi veriniz."
            htmlFor="subjectNoticeMethod"
            hint="Varsa bildirim örneğinin bir nüshasını bildirimin ekinde gönderiniz."
          >
            <textarea {...text('subjectNoticeMethod')} maxLength={5000} />
          </Field>
          <Field
            label="24. İlgili kişilerin veri ihlali ile ilgili bilgi almalarını sağlayacak iletişim yollarını belirtiniz."
            htmlFor="subjectContact"
            hint="İnternet adresi, çağrı merkezi vb. bilgiler"
          >
            <input {...text('subjectContact')} maxLength={1000} />
          </Field>
          <Field
            label="25. Yurtiçinde bulunan diğer organizasyon veya kurumlara ihlal hakkında bilgi verildi mi veya verilecek mi?"
            hint="Örn. polis, diğer denetim ya da gözetim kurumları. Diğer kurumlar ile iletişime geçmeniz gerekebilir."
          >
            <RadioGroup options={YES_NO} value={toYesNo(f.domesticInformed)} onChange={(v) => setF('domesticInformed', fromYesNo(v))} inline />
            {f.domesticInformed && <textarea {...text('domesticDetail')} placeholder="Açıklayınız" aria-label="Yurtiçi açıklama" maxLength={5000} />}
          </Field>
          <Field
            label="26. Yurtdışında bulunan diğer veri koruma otoriteleri veya ilgili kurumlara ihlal hakkında bilgi verildi mi veya verilecek mi?"
            hint="Örn. polis, diğer denetim ya da gözetim kurumları."
          >
            <RadioGroup options={YES_NO} value={toYesNo(f.foreignInformed)} onChange={(v) => setF('foreignInformed', fromYesNo(v))} inline />
            {f.foreignInformed && <textarea {...text('foreignDetail')} placeholder="Açıklayınız" aria-label="Yurtdışı açıklama" maxLength={5000} />}
          </Field>
        </Section>

        <Section title="Ç) Olası sonuçlar">
          <Field
            label="27. İhlal sebebiyle ilgili kişilerin önemli olumsuz etkilere maruz kalma olasılığı"
            required
            hint="İhlalin niteliği, nedeni, ihlale maruz kalan verinin türü, etkisini azaltmak için alınan önlemler ve etkilenen ilgili kişi kategorileri göz önünde bulundurulmalıdır."
          >
            <RadioGroup options={INCIDENT_LIKELIHOODS} value={f.likelihood} onChange={(v) => setF('likelihood', v)} />
          </Field>
          <Field label="28. İhlalin organizasyonunuza olan etkileri">
            <RadioGroup options={INCIDENT_ORG_IMPACTS} value={f.orgImpact} onChange={(v) => setF('orgImpact', v)} />
          </Field>
        </Section>

        <Section title="D) Önlemler">
          <Field
            label="29. İhlal ile ilgili olan çalışanların son bir yıl içerisinde aldığı eğitimler nelerdir?"
            htmlFor="staffTrainings"
            hint={ATTACH}
          >
            <textarea {...text('staffTrainings')} maxLength={5000} />
          </Field>
          <div className="field">
            <span className="field-label">
              30. Bu tür ihlalleri engellemek için ihlalin gerçekleşmesinden önce almış olduğunuz teknik ve idari tedbirlerini belirtiniz.
            </span>
            <span className="hint">Her tedbiri ayrı satıra yazın. {ATTACH}</span>
          </div>
          <div className="form-row">
            <Field label="Teknik Tedbirler" htmlFor="measuresBeforeTechnical">
              <textarea {...text('measuresBeforeTechnical')} maxLength={5000} />
            </Field>
            <Field label="İdari Tedbirler" htmlFor="measuresBeforeAdministrative">
              <textarea {...text('measuresBeforeAdministrative')} maxLength={5000} />
            </Field>
          </div>
          <Field label="Açıklama" htmlFor="measuresBefore">
            <textarea {...text('measuresBefore')} maxLength={5000} />
          </Field>
          <div className="field">
            <span className="field-label">
              31. İhlal sonrası almış olduğunuz veya almayı planladığınız teknik ve idari tedbirleri belirtiniz ve bunların tahminen ne zaman
              tamamlanacağı hakkında bilgi veriniz.
            </span>
            <span className="hint">
              Her tedbiri ayrı satıra yazın. Örneğin yanlışlıkla gönderilmiş olan verilerin yok edilmesi, şifrelerin güvenliğinin sağlanması, veri
              güvenliği eğitimi planlanması vb.
            </span>
          </div>
          <div className="form-row">
            <Field label="Teknik Tedbirler" htmlFor="measuresAfterTechnical">
              <textarea {...text('measuresAfterTechnical')} maxLength={5000} />
            </Field>
            <Field label="İdari Tedbirler" htmlFor="measuresAfterAdministrative">
              <textarea {...text('measuresAfterAdministrative')} maxLength={5000} />
            </Field>
          </div>
          <Field label="Açıklama" htmlFor="measuresAfter" hint="Tedbirlerin tahminen ne zaman tamamlanacağını da yazın.">
            <textarea {...text('measuresAfter')} maxLength={5000} />
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
