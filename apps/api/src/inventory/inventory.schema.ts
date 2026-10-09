import { z } from 'zod';

/** Boş metin "girilmedi" (null) olarak saklanır. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null);
const requiredText = z.string().trim().min(1).max(200);
/** Çoklu seçim: boşlar atılır, tekrar edenler birleştirilir. */
const list = z
  .array(z.string().trim().max(2000))
  .max(100)
  .transform((items) => [...new Set(items.filter(Boolean))]);

const fields = {
  department: requiredText,
  activity: requiredText,
  dataCategory: requiredText,
  personalData: optionalText(5000),
  specialCategoryData: optionalText(5000),
  purposes: list,
  storageMedium: z.enum(['physical', 'digital', 'both']).nullish().transform((v) => v ?? null),
  storageLocation: optionalText(1000),
  dataSubjectGroups: list,
  legalBases: list,
  relatedLegislation: optionalText(2000),
  retentionPeriod: optionalText(500),
  recipients: list,
  foreignTransfers: optionalText(5000),
  administrativeMeasures: list,
  technicalMeasures: list,
};

export const createBody = z.object(fields).partial().extend({
  department: fields.department,
  activity: fields.activity,
  dataCategory: fields.dataCategory,
});
export const updateBody = z
  .object(fields)
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Güncellenecek alan yok' });
