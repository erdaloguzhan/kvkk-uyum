/**
 * T.C. kimlik numarası denetimi: 11 hane, ilk hane 0 değil, son iki hane resmi algoritmayla hesaplanan
 * kontrol haneleri. Yanlış yazılan numaralar (ör. bir hanesi eksik/yanlış) kayda girmeden yakalanır.
 */
export function isValidNationalId(value: string): boolean {
  if (!/^[1-9]\d{10}$/.test(value)) return false;
  const d = [...value].map(Number);
  const odd = d[0] + d[2] + d[4] + d[6] + d[8];
  const even = d[1] + d[3] + d[5] + d[7];
  const tenth = (((odd * 7 - even) % 10) + 10) % 10;
  if (tenth !== d[9]) return false;
  const eleventh = d.slice(0, 10).reduce((a, b) => a + b, 0) % 10;
  return eleventh === d[10];
}
