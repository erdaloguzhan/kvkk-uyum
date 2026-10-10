/**
 * Sözleşmeler: kuruluşun tedarikçi, müşteri, çalışan ve kamu kurumlarıyla yaptığı sözleşmelerin kaydı.
 * Web, mobil ve API aynı listeleri kullanır.
 */

export const CONTRACT_TYPES = {
  supplier: 'Tedarikçi',
  customer: 'Müşteri',
  employee: 'Çalışan',
  public_institution: 'Kamu kurumu',
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
} as const;

export type ContractField = keyof typeof CONTRACT_FIELD_LABELS;
