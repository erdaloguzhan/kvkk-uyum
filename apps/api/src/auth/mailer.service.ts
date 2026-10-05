import { Injectable, Logger } from '@nestjs/common';

export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
}

/**
 * E-posta gönderimi. Şimdilik geliştirme amaçlı: gönderilen iletileri loglar ve
 * bellekte tutar (testler buradan okur). SMTP / e-posta sağlayıcısı entegrasyonu
 * bu sınıfın yerine geçecek.
 */
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  readonly outbox: OutgoingMail[] = [];

  async send(mail: OutgoingMail): Promise<void> {
    this.outbox.push(mail);
    if (process.env.NODE_ENV !== 'test') {
      this.logger.log(`E-posta -> ${mail.to}: ${mail.subject}\n${mail.text}`);
    }
  }
}
