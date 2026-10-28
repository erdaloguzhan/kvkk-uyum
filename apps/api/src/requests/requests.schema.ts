import {
  DSR_ANSWER_METHODS,
  DSR_ATTACHMENT_MAX_BYTES,
  DSR_ATTACHMENT_MAX_FILES,
  DSR_CHANNELS,
  DSR_OUTCOMES,
  DSR_RELATIONSHIPS,
  DSR_REQUEST_ITEMS,
  DSR_RESPONSE_METHODS,
  DSR_STATUSES,
} from '@kvkk/shared';
import { z } from 'zod';
import { normalizeMobile } from '../training/phone';
import { isValidNationalId } from '../training/national-id';

const keys = <T extends string>(o: Record<T, unknown>) => Object.keys(o) as [T, ...T[]];

/** Boş metin "girilmedi" (null) olarak saklanır. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null);
const optionalDate = z
  .union([z.iso.date(), z.literal('')])
  .nullish()
  .transform((v) => v || null);
/** Çok parçalı formda dizi alanları JSON metni olarak gelir. */
const json = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => {
    if (typeof v !== 'string') return v;
    try {
      return JSON.parse(v);
    } catch {
      return v;
    }
  }, schema);
const formBoolean = z.preprocess((v) => (typeof v === 'string' ? v === 'true' || v === 'on' : v), z.boolean());

const ITEMS = new Map(DSR_REQUEST_ITEMS.map((i) => [i.no, i]));

const itemsSchema = z
  .array(
    z.object({
      no: z.number().int().min(1).max(10),
      detail: optionalText(2000),
      option: z.enum(['a', 'b', 'c']).nullish(),
    }),
  )
  .min(1, 'En az bir talep seçiniz')
  .max(10)
  .superRefine((items, ctx) => {
    const seen = new Set<number>();
    items.forEach((item, i) => {
      if (seen.has(item.no)) ctx.addIssue({ code: 'custom', path: [i], message: `Talep ${item.no} birden fazla seçilmiş` });
      seen.add(item.no);
      const def = ITEMS.get(item.no)!;
      if (def.detailLabel && !item.detail) {
        ctx.addIssue({ code: 'custom', path: [i, 'detail'], message: `Talep ${item.no}: ${def.detailLabel} yazılmalı` });
      }
      if (def.options && !item.option) {
        ctx.addIssue({ code: 'custom', path: [i, 'option'], message: `Talep ${item.no}: a, b veya c seçeneklerinden biri seçilmeli` });
      }
    });
  })
  .transform((items) =>
    items
      .map((item) => {
        const def = ITEMS.get(item.no)!;
        return {
          no: item.no,
          detail: def.detailLabel ? item.detail : null,
          option: def.options ? (item.option ?? null) : null,
        };
      })
      .sort((a, b) => a.no - b.no),
  );

const applicantFields = {
  fullName: z.string().trim().min(3, 'Ad soyad en az 3 karakter olmalı').max(150),
  nationalId: z
    .string()
    .trim()
    .nullish()
    .transform((v) => v || null)
    .refine((v) => v === null || isValidNationalId(v), 'Geçerli bir T.C. kimlik numarası giriniz'),
  birthDate: optionalDate,
  phone: z
    .string()
    .trim()
    .max(30)
    .nullish()
    .transform((v, ctx) => {
      if (!v) return null;
      const phone = normalizeMobile(v);
      if (!phone) {
        ctx.addIssue({ code: 'custom', message: 'Cep telefonunu 05XX XXX XX XX biçiminde giriniz' });
        return z.NEVER;
      }
      return phone;
    }),
  email: z
    .union([z.email('Geçerli bir e-posta adresi giriniz').max(254), z.literal('')])
    .nullish()
    .transform((v) => v || null),
  address: optionalText(1000),
  relationship: z.enum(keys(DSR_RELATIONSHIPS)),
  relationshipDetail: optionalText(300),
  responseMethod: z.enum(keys(DSR_RESPONSE_METHODS)),
  items: json(itemsSchema),
  description: optionalText(5000),
};

type ApplicantInput = {
  responseMethod: string;
  email: string | null;
  address: string | null;
  relationship: string;
  relationshipDetail: string | null;
  birthDate: string | null;
};

/** Seçilen yanıt yöntemi için gereken bilgi ve doğum tarihinin geçmişte olması. */
function checkApplicant(v: ApplicantInput, ctx: z.RefinementCtx) {
  if (v.responseMethod === 'email' && !v.email) {
    ctx.addIssue({ code: 'custom', path: ['email'], message: 'Yanıtın e-postayla gönderilmesi için e-posta adresi gerekli' });
  }
  if (v.responseMethod === 'postal' && !v.address) {
    ctx.addIssue({ code: 'custom', path: ['address'], message: 'Yanıtın adrese gönderilmesi için adres gerekli' });
  }
  if (v.relationship === 'other' && !v.relationshipDetail) {
    ctx.addIssue({ code: 'custom', path: ['relationshipDetail'], message: 'İlişkinizi açıklayınız' });
  }
  if (v.birthDate && (v.birthDate < '1900-01-01' || v.birthDate > new Date().toISOString().slice(0, 10))) {
    ctx.addIssue({ code: 'custom', path: ['birthDate'], message: 'Geçerli bir doğum tarihi giriniz' });
  }
}

/** Herkese açık online form (FRM-010). Cep telefonu ve kapanış beyanının onayı zorunludur. */
export const publicSubmitBody = z
  .object({
    ...applicantFields,
    phone: applicantFields.phone.refine((v) => v !== null, 'Cep telefonu zorunludur'),
    consent: formBoolean.refine((v) => v, 'Başvurunun değerlendirilmesi için beyanı onaylayınız'),
    captchaToken: z.string().max(2000).optional(),
  })
  .superRefine(checkApplicant);

const manualChannels = keys(DSR_CHANNELS).filter((c) => c !== 'web_form') as [string, ...string[]];

/** Sorumlunun elden, noterden, postayla vb. gelen başvuruyu sisteme girmesi. */
export const manualCreateBody = z
  .object({
    ...applicantFields,
    channel: z.enum(manualChannels as [Exclude<keyof typeof DSR_CHANNELS, 'web_form'>]),
    receivedOn: z.iso.date(),
  })
  .superRefine(checkApplicant);

export const listQuery = z.object({
  status: z.enum(keys(DSR_STATUSES)).optional(),
  q: z.string().trim().max(200).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  overdue: z.enum(['true']).optional(),
});

export const reportQuery = z.object({ from: z.iso.date().optional(), to: z.iso.date().optional() });

export const statusBody = z.object({
  status: z.enum(['new', 'in_review', 'awaiting_info']),
  note: optionalText(2000),
});

export const noteBody = z.object({ note: z.string().trim().min(1, 'Not boş olamaz').max(2000) });

export const answerBody = z.object({
  answeredOn: z.iso.date(),
  outcome: z.enum(keys(DSR_OUTCOMES)),
  method: z.enum(keys(DSR_ANSWER_METHODS)),
  summary: z.string().trim().min(3, 'Cevabın özetini veya ret gerekçesini yazınız').max(5000),
});

export const formSettingsBody = z.object({ enabled: z.boolean() });

/** Multer sınırları; kurallar ayrıca serviste dosya içeriğine göre kontrol edilir. */
export const uploadLimits = {
  limits: { fileSize: DSR_ATTACHMENT_MAX_BYTES, files: DSR_ATTACHMENT_MAX_FILES },
};
