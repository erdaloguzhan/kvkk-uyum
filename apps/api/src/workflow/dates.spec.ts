import { addDays, addMonths, dateIn, daysBetween, formatDate } from './dates';

describe('tarih yardımcıları', () => {
  it('günü Türkiye saatine göre alır', () => {
    // UTC 22:30 = Türkiye saatiyle ertesi gün 01:30
    expect(dateIn(new Date('2026-10-09T22:30:00Z'))).toBe('2026-10-10');
    expect(dateIn(new Date('2026-10-09T20:59:00Z'))).toBe('2026-10-09');
  });

  it('ay sonlarını doğru taşır', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-08-31', 6)).toBe('2027-02-28');
    expect(addMonths('2026-10-15', 12)).toBe('2027-10-15');
    expect(addMonths('2026-11-30', 3)).toBe('2027-02-28');
  });

  it('gün farkı ve biçim', () => {
    expect(daysBetween('2026-10-09', '2026-10-16')).toBe(7);
    expect(daysBetween('2026-10-16', '2026-10-09')).toBe(-7);
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(formatDate('2026-10-09')).toBe('09.10.2026');
  });
});
