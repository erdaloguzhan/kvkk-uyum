import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';
import { PasswordResetService } from '../auth/password-reset.service';
import { generateToken, hashPassword } from '../common/crypto';
import { AppConfig, CONFIG } from '../config';
import { Database, InjectDb } from '../db/db.module';
import { users } from '../db/schema';

/**
 * İlk platform yöneticilerini `PLATFORM_ADMIN_EMAILS` ayarından tanımlar. Kayıtlı kullanıcı yönetici yapılır;
 * kayıtlı değilse hesap açılır ve şifre oluşturma bağlantısı e-postayla gönderilir. Ayardan çıkarılan
 * adreslerin yöneticiliği kaldırılmaz.
 */
@Injectable()
export class PlatformAdminSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(PlatformAdminSeeder.name);

  constructor(
    @InjectDb() private readonly db: Database,
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly passwordReset: PasswordResetService,
    private readonly audit: AuditService,
  ) {}

  async onApplicationBootstrap() {
    for (const email of this.config.platformAdminEmails) {
      try {
        await this.ensureAdmin(email);
      } catch (err) {
        this.logger.warn(`Platform yöneticisi tanımlanamadı (${email}): ${(err as Error).message}`);
      }
    }
  }

  private async ensureAdmin(email: string) {
    const [promoted] = await this.db
      .update(users)
      .set({ isPlatformAdmin: true })
      .where(sql`lower(${users.email}) = lower(${email}) and ${users.isPlatformAdmin} = false`)
      .returning({ id: users.id });
    if (promoted) {
      await this.audit.record({ action: 'platform_admin.granted', userId: promoted.id, metadata: { email } });
      return;
    }
    const [created] = await this.db
      .insert(users)
      .values({
        email,
        fullName: 'Platform Yöneticisi',
        // Kullanılamaz rastgele şifre; yönetici bağlantıyla kendi şifresini oluşturur.
        passwordHash: await hashPassword(generateToken()),
        isPlatformAdmin: true,
      })
      .onConflictDoNothing()
      .returning({ id: users.id, email: users.email });
    if (!created) return; // Zaten yönetici.
    await this.audit.record({ action: 'platform_admin.granted', userId: created.id, metadata: { email, created: true } });
    await this.passwordReset.sendInvite(created, null, {
      subject: 'KVK Yönetim Sistemi yönetici hesabınız',
      intro: 'KVK Yönetim Sistemi için platform yöneticisi hesabınız oluşturuldu.',
    });
    this.logger.log(`Platform yöneticisi hesabı açıldı, şifre oluşturma bağlantısı gönderildi: ${email}`);
  }
}
