import { SUPPORT_ATTACHMENT_MAX_BYTES, SUPPORT_ATTACHMENT_MAX_FILES, SUPPORT_CATEGORIES, SUPPORT_STATUSES, SupportCategory, SupportStatus } from '@kvkk/shared';
import { z } from 'zod';

const categories = Object.keys(SUPPORT_CATEGORIES) as [SupportCategory, ...SupportCategory[]];
const statuses = Object.keys(SUPPORT_STATUSES) as [SupportStatus, ...SupportStatus[]];

const body = z.string().trim().min(1, 'Mesaj boş olamaz').max(10_000);
/** Çok parçalı formdan gelen "true"/"false" değerleri. */
const formBoolean = z.preprocess((v) => (typeof v === 'string' ? v === 'true' || v === 'on' : v), z.boolean());

export const createTicketBody = z.object({
  subject: z.string().trim().min(3, 'Konu en az 3 karakter olmalı').max(200),
  category: z.enum(categories),
  body,
});

export const userReplyBody = z.object({ body });
export const staffReplyBody = z.object({ body, close: formBoolean.default(false) });

export const userListQuery = z.object({ status: z.enum(statuses).optional() });

export const adminListQuery = z.object({
  status: z.enum(statuses).optional(),
  assignee: z.union([z.literal('me'), z.literal('none'), z.uuid()]).optional(),
  organizationId: z.uuid().optional(),
  q: z.string().trim().max(200).optional(),
});

export const adminUpdateBody = z
  .object({ assigneeId: z.uuid().nullable(), status: z.enum(statuses) })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Güncellenecek alan yok' });

/** Multer sınırları; kurallar ayrıca serviste dosya içeriğine göre kontrol edilir. */
export const uploadLimits = {
  limits: { fileSize: SUPPORT_ATTACHMENT_MAX_BYTES, files: SUPPORT_ATTACHMENT_MAX_FILES },
};
