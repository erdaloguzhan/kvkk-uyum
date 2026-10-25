/**
 * Cep telefonunu tek biçime getirir: 05XXXXXXXXX (11 hane). Boşluk, tire, nokta ve parantez atılır;
 * +90 / 90 / 0090 ön eki ve Excel'de baştaki sıfırı düşmüş 5XXXXXXXXX yazımı kabul edilir.
 * Türkiye cep telefonu değilse null döner.
 */
export function normalizeMobile(value: string): string | null {
  let digits = value.replace(/[\s\-.()/]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  if (!/^\d+$/.test(digits)) return null;
  if (digits.startsWith('0090')) digits = digits.slice(4);
  else if (digits.startsWith('90') && digits.length === 12) digits = digits.slice(2);
  if (digits.length === 10 && digits.startsWith('5')) digits = `0${digits}`;
  return /^05\d{9}$/.test(digits) ? digits : null;
}
