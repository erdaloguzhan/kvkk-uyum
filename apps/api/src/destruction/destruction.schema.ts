import { DESTRUCTION_OPERATIONS, DESTRUCTION_PERIOD_OPTIONS, DestructionOperation, STORAGE_MEDIA, StorageMedium } from '@kvkk/shared';
import { z } from 'zod';

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
const optionalId = z
  .union([z.uuid(), z.literal('')])
  .nullish()
  .transform((v) => v || null);

const operation = z.enum(Object.keys(DESTRUCTION_OPERATIONS) as [DestructionOperation, ...DestructionOperation[]]);
const storageMedium = z
  .union([z.enum(Object.keys(STORAGE_MEDIA) as [StorageMedium, ...StorageMedium[]]), z.literal('')])
  .nullish()
  .transform((v) => v || null);

export const settingsBody = z.object({
  periodMonths: z.coerce
    .number()
    .int()
    .refine((v) => (DESTRUCTION_PERIOD_OPTIONS as readonly number[]).includes(v), 'Geçersiz süre'),
});

const officerFields = {
  employeeId: optionalId,
  fullName: z.string().trim().max(200).optional(),
  title: optionalText(200),
  startDate: z.iso.date(),
  endDate: optionalDate,
  note: optionalText(2000),
};

export const officerBody = z
  .object(officerFields)
  .refine((v) => v.employeeId || v.fullName, { message: 'Ad soyad girin veya çalışan seçin', path: ['fullName'] });
export const officerUpdateBody = z
  .object(officerFields)
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Güncellenecek alan yok' });

export const planBody = z.object({
  title: z.string().trim().min(1).max(200),
  periodStart: z.iso.date(),
  periodEnd: z.iso.date(),
  description: optionalText(5000),
  /** true: veri envanterindeki tüm satırlar plana imha işi olarak eklenir. */
  fromInventory: z.boolean().optional(),
});
export const planUpdateBody = planBody
  .omit({ fromInventory: true })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Güncellenecek alan yok' });

export const nextPlanBody = z.object({ title: z.string().trim().min(1).max(200).optional() });

export const fromInventoryBody = z.object({
  /** Boşsa plana henüz eklenmemiş tüm envanter satırları eklenir. */
  entryIds: z.array(z.uuid()).max(2000).optional(),
});

const itemFields = {
  inventoryEntryId: optionalId,
  dataDescription: z.string().trim().min(1).max(1000),
  storageMedium,
  retentionPeriod: optionalText(500),
  plannedDate: z.iso.date(),
  operationType: operation,
  method: optionalText(2000),
  officerId: optionalId,
};

export const itemBody = z.object(itemFields).partial({ dataDescription: true }).refine(
  (v) => v.inventoryEntryId || v.dataDescription,
  { message: 'İmha edilecek veriyi yazın veya envanterden seçin', path: ['dataDescription'] },
);
export const itemUpdateBody = z
  .object(itemFields)
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Güncellenecek alan yok' });

export const completeBody = z.object({
  performedDate: z.iso.date(),
  operationType: operation.optional(),
  performedNote: z.string().trim().min(2).max(5000),
  officerId: optionalId,
});

export const cancelItemBody = z.object({ reason: z.string().trim().min(2).max(2000) });

export const recordBody = z.object({
  inventoryEntryId: optionalId,
  dataDescription: z.string().trim().min(1).max(1000),
  storageMedium,
  performedDate: z.iso.date(),
  operationType: operation,
  performedNote: z.string().trim().min(2).max(5000),
  officerId: optionalId,
});
export const recordUpdateBody = recordBody
  .omit({ inventoryEntryId: true })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Güncellenecek alan yok' });

export const recordListQuery = z.object({
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  operationType: operation.optional(),
  q: z.string().trim().max(200).optional(),
});

export const submitBody = z.object({
  approverId: z.uuid(),
  dueDate: optionalDate,
  note: optionalText(2000),
});
export const decisionBody = z.object({ note: optionalText(2000) });
export const rejectBody = z.object({ note: z.string().trim().min(2).max(2000) });
