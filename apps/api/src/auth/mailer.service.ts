import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
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
 * E-posta sunucusu iletiyi almadığında atılır. 503 olduğu için sistem uyarısı yine gider; kullanıcı Nest'in
 * İngilizce "Internal server error" yanıtı yerine nedeni Türkçe görür (26.11.2026: SMTP şifresi hatalıyken
 * "Daveti yeniden gönder" anlaşılır bir hata göstermiyordu).
 */
export class MailDeliveryError extends ServiceUnavailableException {
  constructor(
    readonly reason: string,
    cause: unknown,
  ) {
    super(`E-posta gönderilemedi: ${reason}. Lütfen sistem yöneticisine bildirin.`, { cause });
  }
}

/** nodemailer hata kodundan kullanıcıya gösterilecek neden. */
export function mailFailureReason(err: unknown) {
  const code = (err as { code?: string } | null)?.code;
  switch (code) {
    case 'EAUTH':
      return 'e-posta sunucusu kullanıcı adını veya şifreyi kabul etmedi';
    case 'ECONNECTION':
    case 'ETIMEDOUT':
    case 'ESOCKET':
    case 'EDNS':
    case 'ETLS':
      return 'e-posta sunucusuna bağlanılamadı';
    case 'EENVELOPE':
      return 'e-posta sunucusu alıcı adresini kabul etmedi';
    default:
      return 'e-posta sunucusu iletiyi kabul etmedi';
  }
}

/** Loglar için: "erdal@hotmail.com" -> "er***@hotmail.com". */
export function maskEmail(email: string) {
  const at = email.lastIndexOf('@');
  if (at < 0) return '***';
  return `${email.slice(0, Math.min(2, at))}***${email.slice(at)}`;
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
      // Gönderilen iletiler info@ kutusunun "Gönderilmiş" klasörüne düşmez; ne gittiği yalnızca bu loglardan
      // anlaşılır (26.11.2026). Alıcının adresi loga maskeli yazılır.
      try {
        const info = await this.transport.sendMail({ from: this.config.mailFrom, ...mail, html: textToHtml(mail.text) });
        this.logger.log(`E-posta gönderildi -> ${maskEmail(mail.to)} "${mail.subject}" id=${info.messageId} yanıt=${info.response}`);
      } catch (err) {
        this.logger.error(`E-posta gönderilemedi -> ${maskEmail(mail.to)} "${mail.subject}": ${err}`);
        throw new MailDeliveryError(mailFailureReason(err), err);
      }
    } else if (process.env.NODE_ENV !== 'test') {
      this.logger.log(`E-posta -> ${mail.to}: ${mail.subject}\n${mail.text}`);
    }
  }
}
