/**
 * Kişisel veri imha yönetimi: imha sorumluları, dönemsel imha planları ve gerçekleşen imha işlemi kayıtları.
 * Web, mobil ve API aynı listeleri kullanır.
 */

/** İmha yöntemleri (Kişisel Verilerin Silinmesi, Yok Edilmesi veya Anonim Hale Getirilmesi Hakkında Yönetmelik). */
export const DESTRUCTION_OPERATIONS = {
  deletion: 'Silme',
  destruction: 'Yok etme',
  anonymization: 'Anonim hale getirme',
} as const;

export type DestructionOperation = keyof typeof DESTRUCTION_OPERATIONS;

/** Plandaki imha işinin durumu. Gerçekleşen iş için imha işlemi kaydı açılır. */
export const DESTRUCTION_ITEM_STATUSES = {
  planned: 'Planlandı',
  done: 'Gerçekleşti',
  cancelled: 'İptal edildi',
} as const;

export type DestructionItemStatus = keyof typeof DESTRUCTION_ITEM_STATUSES;

/** İmha planının Yönetici onay durumu. Onaylı plan değiştirilirse yeniden taslağa döner. */
export const DESTRUCTION_PLAN_STATUSES = {
  draft: 'Taslak',
  pending: 'Onay bekliyor',
  approved: 'Onaylandı',
  rejected: 'Reddedildi',
} as const;

export type DestructionPlanStatus = keyof typeof DESTRUCTION_PLAN_STATUSES;

/** Saklama ve İmha Politikası (POL-020) periyodik imhayı altı ayda bir öngörür; kuruluş bazında değiştirilebilir. */
export const DEFAULT_DESTRUCTION_PERIOD_MONTHS = 6;

/** Periyodik imha süresi için seçenekler (ay). Yönetmelik en fazla 6 ay öngörür. */
export const DESTRUCTION_PERIOD_OPTIONS = [1, 2, 3, 4, 5, 6] as const;
