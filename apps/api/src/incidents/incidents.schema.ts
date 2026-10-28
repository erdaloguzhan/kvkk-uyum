import {
  INCIDENT_CYBER_ELEMENTS,
  INCIDENT_LIKELIHOODS,
  INCIDENT_ORG_IMPACTS,
  INCIDENT_PERSONAL_DATA_CATEGORIES,
  INCIDENT_RECOVERIES,
  INCIDENT_SOURCES,
  INCIDENT_SPECIAL_DATA_CATEGORIES,
  INCIDENT_STATUSES,
  INCIDENT_SUBJECT_EFFECTS,
  INCIDENT_SUBJECT_GROUPS,
  INCIDENT_SUBJECT_NOTICES,
  IncidentImpact,
  IncidentLikelihood,
  IncidentRecovery,
  IncidentStatus,
  IncidentSubjectNotice,
} from '@kvkk/shared';
import { z } from 'zod';

/** Boş metin "girilmedi" (null) olarak saklanır. */
const optionalText = (max = 5000) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null);
const keysOf = <K extends string>(o: Record<K, unknown>) => Object.keys(o) as [K, ...K[]];
const choice = <K extends string>(keys: [K, ...K[]]) =>
  z
    .union([z.enum(keys), z.literal('')])
    .nullish()
    .transform((v) => (v || null) as K | null);
/** Çoklu seçim: yalnızca FRM-020'deki seçenekler; tekrarlar atılır. "Diğer" ayrı metin alanındadır. */
const options = (list: readonly string[]) =>
  z
    .array(z.enum(list as [string, ...string[]]))
    .max(list.length)
    .optional()
    .transform((v) => [...new Set(v ?? [])]);
const optionalCount = z
  .union([z.number().int().min(0).max(1_000_000_000), z.literal(''), z.null()])
  .optional()
  .transform((v) => (v === '' || v === undefined ? null : v));
const optionalBool = z.boolean().nullish().transform((v) => v ?? null);
/** Saat dilimi bilgisi olan ISO tarih-saat (web, yerel saati ISO'ya çevirip gönderir). */
const dateTime = z.iso.datetime({ offset: true }).transform((v) => new Date(v));
const optionalDateTime = z
  .union([dateTime, z.literal(''), z.null()])
  .optional()
  .transform((v) => (v === '' || v === undefined ? null : v));

export const formSchema = z
  .object({
    controllerName: optionalText(500),
    controllerAddress: optionalText(1000),
    preparerName: optionalText(200),
    preparerTitle: optionalText(200),
    preparerEmail: z
      .union([z.email().max(254), z.literal('')])
      .nullish()
      .transform((v) => v || null),
    preparerPhone: optionalText(50),
    description: optionalText(),
    sources: options(INCIDENT_SOURCES),
    sourceOther: optionalText(1000),
    personalCategories: options(INCIDENT_PERSONAL_DATA_CATEGORIES),
    specialCategories: options(INCIDENT_SPECIAL_DATA_CATEGORIES),
    categoryOther: optionalText(1000),
    estimatedPeople: optionalCount,
    estimatedRecords: optionalCount,
    subjectGroups: options(INCIDENT_SUBJECT_GROUPS),
    subjectGroupOther: optionalText(1000),
    subjectEffects: options(INCIDENT_SUBJECT_EFFECTS),
    subjectEffectOther: optionalText(1000),
    delayReason: optionalText(),
    potentialEffects: optionalText(),
    likelihood: choice<IncidentLikelihood>(keysOf(INCIDENT_LIKELIHOODS)),
    likelihoodDetail: optionalText(1000),
    orgImpact: choice<IncidentImpact>(keysOf(INCIDENT_ORG_IMPACTS)),
    orgRecovery: choice<IncidentRecovery>(keysOf(INCIDENT_RECOVERIES)),
    cyberAttack: optionalBool,
    cyberElements: options(INCIDENT_CYBER_ELEMENTS),
    cyberElementOther: optionalText(1000),
    cyberImpact: choice<IncidentImpact>(keysOf(INCIDENT_ORG_IMPACTS)),
    cyberRecovery: choice<IncidentRecovery>(keysOf(INCIDENT_RECOVERIES)),
    staffTrained: optionalBool,
    measuresBefore: optionalText(),
    measuresAfter: optionalText(),
    recurrenceSteps: optionalText(),
    subjectNotice: choice<IncidentSubjectNotice>(keysOf(INCIDENT_SUBJECT_NOTICES)),
    subjectNoticeMethod: optionalText(),
    subjectContact: optionalText(1000),
    domesticInformed: optionalBool,
    domesticDetail: optionalText(),
    foreignInformed: optionalBool,
    foreignDetail: optionalText(),
  })
  .strict();

const fields = {
  title: z.string().trim().min(1).max(300),
  occurredAt: optionalDateTime,
  detectedAt: dateTime,
  followUpRef: optionalText(200),
};

export const createBody = z.object({
  ...fields,
  /** Gönderilmeyen alanlar boş kalır; A bölümü boşsa kuruluş ve kullanıcı bilgilerinden doldurulur. */
  form: formSchema.partial().optional(),
});

export const updateBody = z
  .object({ ...fields, form: formSchema.partial() })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Güncellenecek alan yok' });

export const submitBody = z.object({
  approverId: z.uuid(),
  note: optionalText(2000),
});

export const decisionBody = z.object({ note: optionalText(2000) });
export const rejectBody = z.object({ note: z.string().trim().min(2).max(2000) });

export const notifiedBody = z.object({
  /** Kurula gönderildiği an; verilmezse şimdi. */
  notifiedAt: optionalDateTime,
  note: optionalText(2000),
});

export const closeBody = z.object({ note: z.string().trim().min(2).max(2000) });

const isoDate = z
  .union([z.iso.date(), z.literal('')])
  .optional()
  .transform((v) => v || undefined);

export const listQuery = z.object({
  status: z.enum(keysOf<IncidentStatus>(INCIDENT_STATUSES)).optional(),
  q: z.string().trim().max(200).optional(),
  /** Tespit tarihi aralığı (gün, Türkiye saati). */
  from: isoDate,
  to: isoDate,
});

export const reportQuery = z.object({ from: isoDate, to: isoDate });
