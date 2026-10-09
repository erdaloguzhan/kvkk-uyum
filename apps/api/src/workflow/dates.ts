import { DEFAULT_TIME_ZONE } from '@kvkk/shared';

/** Son tarihler saat bilgisi olmadan `YYYY-MM-DD` olarak tutulur. */
export type IsoDate = string;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Verilen andaki takvim günü (varsayılan: Türkiye saati). */
export function dateIn(now: Date, timeZone = DEFAULT_TIME_ZONE): IsoDate {
  // en-CA biçimi YYYY-MM-DD verir.
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

function toUtc(date: IsoDate) {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtc(ms: number): IsoDate {
  return new Date(ms).toISOString().slice(0, 10);
}

/** `to` - `from` gün farkı. */
export function daysBetween(from: IsoDate, to: IsoDate) {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return fromUtc(toUtc(date) + days * DAY_MS);
}

/** Ay ekler; hedef ayda o gün yoksa ayın son gününe çeker (31 Ocak + 1 ay = 28/29 Şubat). */
export function addMonths(date: IsoDate, months: number): IsoDate {
  const [y, m, d] = date.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return fromUtc(target.getTime());
}

/** Kullanıcıya gösterilecek biçim: 09.10.2026 */
export function formatDate(date: IsoDate) {
  const [y, m, d] = date.split('-');
  return `${d}.${m}.${y}`;
}
