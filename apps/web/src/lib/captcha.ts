'use client';

interface Challenge {
  algorithm: string;
  challenge: string;
  salt: string;
  maxnumber: number;
  signature: string;
}

const BATCH = 500;

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Bot koruması: sunucudan imzalı bir soru alır ve sha256(salt + n) = challenge eşitliğini sağlayan n'i
 * arka planda bulur (genellikle 1 saniyenin altında). Dönen değer giriş ve şifre sıfırlama isteklerine
 * `captchaToken` olarak eklenir. Hiçbir dış servise istek gitmez.
 */
export async function solveCaptcha(): Promise<string> {
  const res = await fetch('/api/v1/auth/captcha', { cache: 'no-store' });
  if (!res.ok) throw new Error('Güvenlik doğrulaması alınamadı. Lütfen sayfayı yenileyin.');
  const c = (await res.json()) as Challenge;
  for (let start = 0; start <= c.maxnumber; start += BATCH) {
    const numbers = Array.from({ length: Math.min(BATCH, c.maxnumber - start + 1) }, (_, i) => start + i);
    const hashes = await Promise.all(numbers.map((n) => sha256Hex(c.salt + n)));
    const found = hashes.indexOf(c.challenge);
    if (found >= 0) {
      const solution = { algorithm: c.algorithm, challenge: c.challenge, number: numbers[found], salt: c.salt, signature: c.signature };
      return btoa(JSON.stringify(solution));
    }
  }
  throw new Error('Güvenlik doğrulaması tamamlanamadı. Lütfen sayfayı yenileyin.');
}
