import { INVENTORY_COLUMNS } from '@kvkk/shared';

/** Kuruluş profili alanlarının Türkçe adları. */
export const ORG_FIELD_LABELS: Record<string, string> = {
  name: 'Ünvan',
  address: 'Adres',
  email: 'E-posta',
  phone: 'Telefon',
  kepAddress: 'KEP adresi',
  authorizedPerson: 'Yetkili kişi',
  taxNumber: 'Vergi numarası',
  website: 'Web sitesi',
};

const OTHER_LABELS: Record<string, string> = {
  fullName: 'Ad soyad',
  password: 'Şifre',
  code: 'Kod',
  title: 'Başlık',
  dueDate: 'Son tarih',
  assigneeId: 'Atanan kişi',
  note: 'Not',
  ...Object.fromEntries(INVENTORY_COLUMNS.map((c) => [c.field, c.label])),
};

export function fieldLabel(field: string): string {
  return ORG_FIELD_LABELS[field] ?? OTHER_LABELS[field] ?? field;
}

const dateFormat = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const dateTimeFormat = new Intl.DateTimeFormat('tr-TR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Istanbul',
});

/** "2026-10-09" gibi gün değerlerini 09.10.2026 olarak gösterir. */
export function formatDay(day: string | null | undefined): string {
  if (!day) return '—';
  const [y, m, d] = day.slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  return dateTimeFormat.format(new Date(value));
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  return dateFormat.format(new Date(value));
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Bugünün tarihi (İstanbul saatine göre) YYYY-AA-GG olarak. */
export function todayIso(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date());
}

export function daysLeftText(daysLeft: number | null, overdue: boolean): string {
  if (daysLeft === null) return '';
  if (overdue) return `${-daysLeft} gün gecikti`;
  if (daysLeft === 0) return 'Son gün bugün';
  if (daysLeft === 1) return 'Yarın';
  return `${daysLeft} gün kaldı`;
}
