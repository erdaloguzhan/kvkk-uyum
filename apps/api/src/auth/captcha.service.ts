import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { AppConfig, CONFIG } from '../config';

const TURNSTILE_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** Tarayıcının deneyeceği en büyük sayı; ortalama yarısı kadar SHA-256 hesabı (birkaç yüz milisaniye) sürer. */
export const CAPTCHA_MAX_NUMBER = 100_000;
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

export interface CaptchaChallenge {
  algorithm: 'SHA-256';
  /** sha256(salt + sayı); tarayıcı bu sayıyı bulur. */
  challenge: string;
  salt: string;
  maxnumber: number;
  /** Sunucunun imzası: sorunun bu sunucudan çıktığını kanıtlar, sunucu soruyu saklamaz. */
  signature: string;
}

interface CaptchaSolution {
  algorithm: string;
  challenge: string;
  number: number;
  salt: string;
  signature: string;
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/**
 * Bot koruması (CAPTCHA). Varsayılan: sunucunun kendisinde çalışan iş kanıtı (proof-of-work, ALTCHA biçimi).
 * Tarayıcı imzalı bir soru alır ve arka planda sha256(salt + n) = challenge eşitliğini sağlayan n'i bulur;
 * bu, toplu otomatik denemeleri pahalı hale getirir. Ziyaretçi verisi hiçbir dış servise gönderilmez.
 * Her çözüm bir kez kullanılabilir ve 5 dakika geçerlidir.
 *
 * `CAPTCHA_SECRET` tanımlıysa bunun yerine Cloudflare Turnstile doğrulanır (web arayüzünde Turnstile bileşeni
 * olmadığı için web ile kullanılamaz; ziyaretçi IP'si yurt dışına gider).
 */
@Injectable()
export class CaptchaService {
  /** Testlerde kapalıdır; CAPTCHA testi açar. */
  enabled = process.env.NODE_ENV !== 'test';
  private readonly hmacKey: Buffer;
  /** Kullanılmış çözümler (imza → son geçerlilik); süresi geçenler temizlenir. */
  private readonly used = new Map<string, number>();

  constructor(@Inject(CONFIG) private readonly config: AppConfig) {
    this.hmacKey = createHmac('sha256', config.jwtSecret).update('kvkk-captcha').digest();
  }

  createChallenge(now = Date.now()): CaptchaChallenge {
    const expires = Math.floor((now + CHALLENGE_TTL_MS) / 1000);
    const salt = `${randomBytes(12).toString('hex')}?expires=${expires}`;
    const challenge = sha256(salt + randomInt(CAPTCHA_MAX_NUMBER + 1));
    return { algorithm: 'SHA-256', challenge, salt, maxnumber: CAPTCHA_MAX_NUMBER, signature: this.sign(challenge) };
  }

  async verify(token: string | undefined, ip?: string | null): Promise<void> {
    if (this.config.captchaSecret) return this.verifyTurnstile(token, ip);
    if (!this.enabled) return;
    if (!token || !this.verifySolution(token)) {
      throw new BadRequestException('Güvenlik doğrulaması başarısız oldu. Sayfayı yenileyip tekrar deneyin.');
    }
  }

  private verifySolution(token: string, now = Date.now()): boolean {
    let s: CaptchaSolution;
    try {
      s = JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
    } catch {
      return false;
    }
    if (
      s?.algorithm !== 'SHA-256' ||
      typeof s.challenge !== 'string' ||
      typeof s.salt !== 'string' ||
      typeof s.signature !== 'string' ||
      !Number.isInteger(s.number) ||
      s.number < 0 ||
      s.number > CAPTCHA_MAX_NUMBER
    ) {
      return false;
    }
    const expected = Buffer.from(this.sign(s.challenge), 'hex');
    const given = Buffer.from(s.signature, 'hex');
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;
    const expires = Number(/[?&]expires=(\d+)/.exec(s.salt)?.[1]) * 1000;
    if (!expires || expires < now) return false;
    if (sha256(s.salt + s.number) !== s.challenge) return false;

    for (const [key, until] of this.used) if (until < now) this.used.delete(key);
    if (this.used.has(s.signature)) return false;
    this.used.set(s.signature, expires);
    return true;
  }

  private sign(challenge: string) {
    return createHmac('sha256', this.hmacKey).update(challenge).digest('hex');
  }

  private async verifyTurnstile(token: string | undefined, ip?: string | null) {
    if (!token) throw new BadRequestException('CAPTCHA doğrulaması gerekli');
    const body = new URLSearchParams({ secret: this.config.captchaSecret!, response: token });
    if (ip) body.set('remoteip', ip);
    const res = await fetch(TURNSTILE_URL, { method: 'POST', body });
    const data = (await res.json()) as { success: boolean };
    if (!data.success) throw new BadRequestException('CAPTCHA doğrulaması başarısız');
  }
}
