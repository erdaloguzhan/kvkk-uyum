/**
 * İş akışı ve alarmlar: görevler, son tarih hatırlatmaları ve onay talepleri.
 * Web, mobil ve API aynı listeleri kullanır.
 */

/** Görev türleri. `approval` görevleri onay talebiyle birlikte oluşur ve onay/ret ile kapanır. */
export const TASK_TYPES = {
  general: 'Genel',
  document_review: 'Doküman gözden geçirme',
  inventory_review: 'Envanter gözden geçirme',
  data_destruction: 'Periyodik imha',
  approval: 'Onay',
} as const;

export type TaskType = keyof typeof TASK_TYPES;

export const TASK_STATUSES = {
  open: 'Açık',
  done: 'Tamamlandı',
  cancelled: 'İptal edildi',
} as const;

export type TaskStatus = keyof typeof TASK_STATUSES;

/** Göreve bağlanabilecek kayıtlar. */
export const TASK_ENTITY_TYPES = {
  document: 'Doküman',
  inventory_entry: 'Envanter satırı',
} as const;

export type TaskEntityType = keyof typeof TASK_ENTITY_TYPES;

/**
 * Tekrarlayan görevler için seçenekler (ay cinsinden). Tekrarlayan görev tamamlanınca
 * bir sonraki dönemin görevi aynı kişiye otomatik açılır.
 */
export const TASK_RECURRENCES = [
  { months: 1, label: 'Her ay' },
  { months: 3, label: '3 ayda bir' },
  { months: 6, label: '6 ayda bir' },
  { months: 12, label: 'Yılda bir' },
] as const;

export const TASK_RECURRENCE_MONTHS = TASK_RECURRENCES.map((r) => r.months);

/** Son tarihten kaç gün önce hatırlatma gönderileceği (görev bazında değiştirilebilir). */
export const DEFAULT_REMINDER_DAYS = [7, 1];

/** Onay talebi verilirken son tarih verilmezse kullanılan süre (gün). */
export const DEFAULT_APPROVAL_DUE_DAYS = 7;

export const APPROVAL_STATUSES = {
  pending: 'Onay bekliyor',
  approved: 'Onaylandı',
  rejected: 'Reddedildi',
  cancelled: 'İptal edildi',
} as const;

export type ApprovalStatus = keyof typeof APPROVAL_STATUSES;

/** Bildirim (alarm) türleri. */
export const NOTIFICATION_KINDS = {
  task_assigned: 'Yeni görev',
  task_reminder: 'Yaklaşan son tarih',
  task_due_today: 'Son gün bugün',
  task_overdue: 'Süresi geçti',
  approval_requested: 'Onay talebi',
  approval_decided: 'Onay sonucu',
} as const;

export type NotificationKind = keyof typeof NOTIFICATION_KINDS;

/** Tarihler (son tarih) kuruluşun saat dilimine göre gün olarak değerlendirilir. */
export const DEFAULT_TIME_ZONE = 'Europe/Istanbul';
