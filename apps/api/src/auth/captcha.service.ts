import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { AppConfig, CONFIG } from '../config';

const TURNSTILE_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** Cloudflare Turnstile ile CAPTCHA doğrulaması. CAPTCHA_SECRET yoksa kapalıdır. */
@Injectable()
export class CaptchaService {
  constructor(@Inject(CONFIG) private readonly config: AppConfig) {}

  async verify(token: string | undefined, ip?: string | null): Promise<void> {
    if (!this.config.captchaSecret) return;
    if (!token) throw new BadRequestException('CAPTCHA doğrulaması gerekli');

    const body = new URLSearchParams({ secret: this.config.captchaSecret, response: token });
    if (ip) body.set('remoteip', ip);
    const res = await fetch(TURNSTILE_URL, { method: 'POST', body });
    const data = (await res.json()) as { success: boolean };
    if (!data.success) throw new BadRequestException('CAPTCHA doğrulaması başarısız');
  }
}
