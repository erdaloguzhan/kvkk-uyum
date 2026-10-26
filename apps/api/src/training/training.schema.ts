import { z } from 'zod';
import { isValidNationalId } from './national-id';
import { normalizeMobile } from './phone';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null);
const optionalDate = z
  .union([z.iso.date('Tarih YYYY-AA-GG biçiminde olmalı'), z.literal('')])
  .nullish()
  .transform((v) => v || null);

/** Boş bırakılabilir cep telefonu; boşluklu vb. yazımlar 05XXXXXXXXX biçiminde saklanır. */
export const optionalMobile = z
  .string()
  .trim()
  .max(30)
  .nullish()
  .transform((v, ctx) => {
    if (!v) return null;
    const phone = normalizeMobile(v);
    if (!phone) ctx.addIssue({ code: 'custom', message: 'Cep telefonunu 05XX XXX XX XX biçiminde girin' });
    return phone;
  });

/** Eğitim Portalı kullanıcı adı: cep telefonu, kayıttaki biçime (05XXXXXXXXX) çevrilir. */
export const mobileLogin = z
  .string()
  .max(30)
  .transform((v, ctx) => {
    const phone = normalizeMobile(v.trim());
    if (!phone) ctx.addIssue({ code: 'custom', message: 'Cep telefonunu 05XX XXX XX XX biçiminde girin' });
    return phone ?? '';
  });

export const nationalId = z
  .string()
  .trim()
  .refine(isValidNationalId, 'Geçerli bir T.C. kimlik no girin (11 hane)');

/** Çalışan ve eğitimcide ortak kişi bilgileri. */
export const personFields = {
  nationalId,
  firstName: z.string().trim().min(1, 'Adı girin').max(100),
  lastName: z.string().trim().min(1, 'Soyadı girin').max(100),
  hireDate: optionalDate,
  terminationDate: optionalDate,
  phone: optionalMobile,
};

export const employeeBody = z.object({
  ...personFields,
  email: z
    .union([z.email('Geçerli bir e-posta adresi girin').max(254), z.literal('')])
    .nullish()
    .transform((v) => v?.trim() || null),
});
export type EmployeeInput = z.infer<typeof employeeBody>;

const trainerTitle = optionalText(150);
export const trainerCreateBody = z.object({
  ...personFields,
  email: z.email('Geçerli bir e-posta adresi girin').max(254),
  title: trainerTitle,
});
export const trainerUpdateBody = z
  .object({ ...personFields, email: z.email('Geçerli bir e-posta adresi girin').max(254), title: trainerTitle, isActive: z.boolean() })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Güncellenecek alan yok' });

export const trainingCreateBody = z.object({
  name: z.string().trim().min(2, 'Eğitim adını girin').max(300),
  description: optionalText(2000),
  passScore: z.number().int().min(1).max(100).default(70),
});
export const trainingUpdateBody = z
  .object({
    name: z.string().trim().min(2).max(300),
    description: optionalText(2000),
    passScore: z.number().int().min(1).max(100),
    status: z.enum(['draft', 'active']),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Güncellenecek alan yok' });

export const topicBody = z.object({
  title: z.string().trim().min(1, 'Alt konu adını girin').max(300),
  content: z.string().max(200_000).default(''),
  minReadSeconds: z.number().int().min(0).max(3 * 60 * 60).default(60),
});
export const topicUpdateBody = topicBody.partial().refine((v) => Object.keys(v).length > 0, {
  message: 'Güncellenecek alan yok',
});
export const reorderBody = z.object({ ids: z.array(z.uuid()).min(1).max(500) });

export const OPTIONS = ['A', 'B', 'C', 'D'] as const;
export const testType = z.enum(['pre', 'post']);
export const questionBody = z.object({
  testType,
  text: z.string().trim().min(1, 'Soruyu girin').max(2000),
  optionA: z.string().trim().min(1, 'A şıkkını girin').max(1000),
  optionB: z.string().trim().min(1, 'B şıkkını girin').max(1000),
  optionC: z.string().trim().min(1, 'C şıkkını girin').max(1000),
  optionD: z.string().trim().min(1, 'D şıkkını girin').max(1000),
  correctOption: z.enum(OPTIONS),
  points: z.number().int().min(1, 'Puan en az 1 olmalı').max(100),
});
export const questionUpdateBody = questionBody
  .omit({ testType: true })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Güncellenecek alan yok' });

export const groupCreateBody = z.object({
  organizationId: z.uuid(),
  trainingId: z.uuid(),
  name: z.string().trim().min(2, 'Grup adını girin').max(300),
  trainerId: z.uuid('Eğitimci seçin'),
  employeeIds: z.array(z.uuid()).max(5000).default([]),
});
export const groupUpdateBody = z
  .object({ name: z.string().trim().min(2, 'Grup adını girin').max(300), trainerId: z.uuid('Eğitimci seçin') })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Güncellenecek alan yok' });
export const employeeIdsBody = z.object({ employeeIds: z.array(z.uuid()).min(1).max(5000) });
export const sendBody = z
  .object({
    /** Verilmezse henüz gönderilmemiş katılımcılara gönderilir; verilirse bu katılımcılara yeniden gönderilir. */
    participantIds: z.array(z.uuid()).max(5000).optional(),
  })
  .default({});

export const resultsQuery = z.object({
  groupId: z.uuid().optional(),
  trainingId: z.uuid().optional(),
  organizationId: z.uuid().optional(),
});

export const answersBody = z.object({
  answers: z.record(z.uuid(), z.enum(OPTIONS)),
});
