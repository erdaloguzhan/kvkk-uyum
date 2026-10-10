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

const fields = {
  partyName: z.string().trim().min(1).max(300),
  type: z.enum(['supplier', 'customer', 'employee', 'public_institution']),
  startDate: optionalDate,
  endDate: optionalDate,
  status: z.enum(['draft', 'active', 'expired', 'terminated']),
  contactName: optionalText(200),
  contactPhone: optionalText(50),
  contactEmail: z
    .union([z.email().max(254), z.literal('')])
    .nullish()
    .transform((v) => v || null),
  description: optionalText(5000),
};

export const createBody = z.object(fields).partial().extend({
  partyName: fields.partyName,
  type: fields.type,
});
export const updateBody = z
  .object(fields)
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Güncellenecek alan yok' });

export const listQuery = z.object({
  type: fields.type.optional(),
  status: fields.status.optional(),
  q: z.string().trim().max(200).optional(),
});
