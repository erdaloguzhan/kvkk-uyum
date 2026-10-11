/**
 * Sözleşmeler: kuruluşun iş, gizlilik ve veri işleyen sözleşmeleri ile aydınlatma metni ve açık rıza kayıtları.
 * Web, mobil ve API aynı listeleri kullanır.
 */

export const CONTRACT_TYPES = {
  employment: 'Çalışan İş Sözleşmesi',
  employee_confidentiality: 'Çalışan Gizlilik Sözleşmesi',
  processor_confidentiality: 'Dış kaynaklı Veri İşleyen Gizlilik Sözleşmesi',
  privacy_notice: 'Aydınlatma Metni',
  explicit_consent: 'Açık Rıza',
} as const;

export type ContractType = keyof typeof CONTRACT_TYPES;

export const CONTRACT_STATUSES = {
  draft: 'Taslak',
  active: 'Aktif',
  expired: 'Süresi doldu',
  terminated: 'Feshedildi',
} as const;

export type ContractStatus = keyof typeof CONTRACT_STATUSES;

/** Formlarda ve hata mesajlarında kullanılan alan adları. */
export const CONTRACT_FIELD_LABELS = {
  partyName: 'Sözleşme yapılan kişi / kurum',
  type: 'Sözleşme türü',
  startDate: 'Başlangıç tarihi',
  endDate: 'Bitiş tarihi',
  status: 'Statü',
  contactName: 'İlgili kişi ad soyad',
  contactPhone: 'İlgili kişi telefon',
  contactEmail: 'İlgili kişi e-posta',
  description: 'Açıklama',
  signedCopyUrl: 'Islak imzalı sözleşme linki',
} as const;

export type ContractField = keyof typeof CONTRACT_FIELD_LABELS;
