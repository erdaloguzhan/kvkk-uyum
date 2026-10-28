import { Inject, Injectable, Logger } from '@nestjs/common';
import { createTransport, Transporter } from 'nodemailer';
import { AppConfig, CONFIG } from '../config';

export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Düz metinden HTML sürümü: paragraflar, satır sonları ve tıklanabilir bağlantılar. Yalnızca düz metin
 * içeren e-postalar (özellikle Hotmail/Outlook.com) gereksiz e-posta puanını yükseltiyor (27.10.2026).
 */
export function textToHtml(text: string) {
  const body = text
    .trim()
    .split(/\n{2,}/)
    .map((para) => {
      const html = escapeHtml(para)
        .replace(/https?:\/\/[^\s<]+/g, (url) => `<a href="${url}" style="color:#1f5fa8">${url}</a>`)
        .replace(/\n/g, '<br>');
      return `<p style="margin:0 0 14px">${html}</p>`;
    })
    .join('\n');
  return (
    '<!doctype html><html lang="tr"><head><meta charset="utf-8"></head>' +
    '<body style="margin:0;padding:24px;background:#f4f6f9;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#1d2733">' +
    '<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;padding:28px">' +
    body +
    '</div>' +
    '<p style="max-width:560px;margin:12px auto 0;font-size:12px;color:#6b7785">Bu e-posta KVK Uyum Yönetim Sistemi tarafından otomatik olarak gönderilmiştir.</p>' +
    '</body></html>'
  );
}

/**
 * E-posta gönderimi. `SMTP_URL` tanımlıysa SMTP ile gönderir; değilse (geliştirme) iletiyi loglar.
 * Gönderilen iletiler testler için bellekte de tutulur.
 */
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private readonly transport: Transporter | null;
  readonly outbox: OutgoingMail[] = [];

  constructor(@Inject(CONFIG) private readonly config: AppConfig) {
    this.transport = config.smtpUrl ? createTransport(config.smtpUrl) : null;
  }

  async send(mail: OutgoingMail): Promise<void> {
    this.outbox.push(mail);
    if (this.transport) {
      await this.transport.sendMail({ from: this.config.mailFrom, ...mail, html: textToHtml(mail.text) });
    } else if (process.env.NODE_ENV !== 'test') {
      this.logger.log(`E-posta -> ${mail.to}: ${mail.subject}\n${mail.text}`);
    }
  }
}
