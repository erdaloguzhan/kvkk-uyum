import { Inject, Injectable, Logger } from '@nestjs/common';
import { createTransport, Transporter } from 'nodemailer';
import { AppConfig, CONFIG } from '../config';

export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
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
      await this.transport.sendMail({ from: this.config.mailFrom, ...mail });
    } else if (process.env.NODE_ENV !== 'test') {
      this.logger.log(`E-posta -> ${mail.to}: ${mail.subject}\n${mail.text}`);
    }
  }
}
