import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppConfig, CONFIG } from '../config';

export interface OutgoingSms {
  /** 05XXXXXXXXX biçiminde cep telefonu. */
  to: string;
  text: string;
}

const VERIMOR_URL = 'https://sms.verimor.com.tr/v2/send.json';

/**
 * SMS gönderimi (Verimor). Hesap tanımlıysa Verimor API'si ile gönderir; değilse (geliştirme) iletiyi loglar.
 * Gönderilen iletiler testler için bellekte de tutulur.
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  readonly outbox: OutgoingSms[] = [];

  constructor(@Inject(CONFIG) private readonly config: AppConfig) {}

  /**
   * SMS ile kod gönderilebilir mi. Canlı ortamda Verimor hesabı tanımlı değilse hayır: kod yalnızca loglanır ve
   * kimseye ulaşmaz, bu durumda giriş kodu e-postayla gider.
   */
  get available() {
    return !!this.config.verimor || process.env.NODE_ENV !== 'production';
  }

  async send(sms: OutgoingSms): Promise<void> {
    this.outbox.push(sms);
    const account = this.config.verimor;
    if (!account) {
      if (process.env.NODE_ENV !== 'test') this.logger.log(`SMS -> ${sms.to}: ${sms.text}`);
      return;
    }
    const res = await fetch(VERIMOR_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: account.username,
        password: account.password,
        source_addr: this.config.smsHeader,
        valid_for: '00:15',
        messages: [{ msg: sms.text, dest: `9${sms.to}` }],
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Verimor SMS gönderilemedi (${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
}

/** Ekranda gösterilecek maskeli telefon: 0532 *** ** 67. */
export function maskPhone(phone: string) {
  return `${phone.slice(0, 4)} *** ** ${phone.slice(-2)}`;
}
