/**
 * Destek talepleri: kuruluş kullanıcılarının açtığı talepler ve platform destek ekibinin yanıtları.
 * Web, mobil ve API aynı listeleri kullanır.
 */

export const SUPPORT_CATEGORIES = {
  usage: 'Kullanım / nasıl yapılır',
  technical: 'Teknik sorun / hata',
  documents: 'Dokümanlar',
  inventory: 'Veri envanteri',
  training: 'Uzaktan eğitim',
  account: 'Hesap ve erişim',
  other: 'Diğer',
} as const;

export type SupportCategory = keyof typeof SUPPORT_CATEGORIES;

/** Açık: destek ekibinin yanıtını bekliyor. Yanıtlandı: kullanıcının dönüşünü bekliyor. */
export const SUPPORT_STATUSES = {
  open: 'Açık',
  answered: 'Yanıtlandı',
  closed: 'Kapandı',
} as const;

export type SupportStatus = keyof typeof SUPPORT_STATUSES;

/** Ek dosya kuralları (ekran görüntüsü ve PDF). */
export const SUPPORT_ATTACHMENT_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf'] as const;
export const SUPPORT_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
export const SUPPORT_ATTACHMENT_MAX_FILES = 5;
