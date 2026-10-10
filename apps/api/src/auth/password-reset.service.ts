import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';
import { generateToken, hashPassword, sha256 } from '../common/crypto';
import { AppConfig, CONFIG } from '../config';
import { Database, InjectDb } from '../db/db.module';
import { passwordResetTokens, refreshTokens, users } from '../db/schema';
import { MailerService } from './mailer.service';

const RESET_TTL_MS = 60 * 60 * 1000;
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class PasswordResetService {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly mailer: MailerService,
    private readonly audit: AuditService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  /** Kullanıcı yoksa da aynı yanıt döner (e-posta adresi sızdırılmaz). */
  async request(email: string, client: { ip: string | null; userAgent: string | null }) {
    const [user] = await this.db
      .select({ id: users.id, email: users.email, isActive: users.isActive })
      .from(users)
      .where(sql`lower(${users.email}) = lower(${email.trim()})`);
    if (!user?.isActive) return;

    const token = await this.createToken(user.id, RESET_TTL_MS);
    await this.mailer.send({
      to: user.email,
      subject: 'KVK Yönetim Sistemi şifre sıfırlama',
      text:
        `Şifrenizi sıfırlamak için aşağıdaki bağlantıyı açın:\n${this.link(token)}\n\n` +
        `Bağlantı 1 saat geçerlidir. Bağlantı açılmazsa şifre belirleme sayfasına şu kodu girebilirsiniz: ${token}\n\n` +
        'Bu isteği siz yapmadıysanız bu e-postayı dikkate almayın.',
    });
    await this.audit.record({ action: 'auth.password_reset_requested', userId: user.id, ...client });
  }

  /**
   * Yeni hesaba şifre oluşturma bağlantısı gönderir (kuruluşa davet, platform yöneticisi tarafından
   * kuruluş açılması veya ilk platform yöneticisi). Şifre e-postayla gönderilmez; kullanıcı bağlantıyla
   * kendi şifresini oluşturur.
   */
  async sendInvite(
    user: { id: string; email: string; fullName?: string | null },
    organizationName: string | null,
    opts: { subject?: string; intro?: string } = {},
  ) {
    const token = await this.createToken(user.id, INVITE_TTL_MS);
    const greeting = user.fullName ? `Merhaba ${user.fullName},\n\n` : 'Merhaba,\n\n';
    const intro =
      opts.intro ??
      (organizationName
        ? `${organizationName} için KVK Yönetim Sistemi hesabınız oluşturuldu.`
        : 'KVK Yönetim Sistemi hesabınız oluşturuldu.');
    await this.mailer.send({
      to: user.email,
      subject: opts.subject ?? `${organizationName ?? 'KVK Yönetim Sistemi'} - hesabınızı etkinleştirin`,
      text:
        `${greeting}${intro}\n\n` +
        `Şifrenizi oluşturmak için aşağıdaki bağlantıyı açın:\n${this.link(token)}\n\n` +
        `Bağlantı 7 gün geçerlidir. Kullanıcı adınız bu e-posta adresidir: ${user.email}\n` +
        `Bağlantı açılmazsa şifre belirleme sayfasına şu kodu girebilirsiniz: ${token}\n`,
    });
  }

  /** Kullanıcının bekleyen (kullanılmamış) şifre bağlantılarını geçersiz kılar; yeniden davet öncesi çağrılır. */
  async revokePending(userId: string) {
    await this.db
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(passwordResetTokens.userId, userId), isNull(passwordResetTokens.usedAt)));
  }

  private link(token: string) {
    return `${this.config.appUrl}/sifre-belirle?kod=${encodeURIComponent(token)}`;
  }

  async confirm(token: string, newPassword: string, client: { ip: string | null; userAgent: string | null }) {
    const now = new Date();
    const [used] = await this.db
      .update(passwordResetTokens)
      .set({ usedAt: now })
      .where(
        and(
          eq(passwordResetTokens.tokenHash, sha256(token)),
          isNull(passwordResetTokens.usedAt),
          gt(passwordResetTokens.expiresAt, now),
        ),
      )
      .returning({ userId: passwordResetTokens.userId });
    if (!used) throw new BadRequestException('Kod geçersiz veya süresi dolmuş');

    await this.db
      .update(users)
      .set({ passwordHash: await hashPassword(newPassword), failedLoginCount: 0, lockedUntil: null })
      .where(eq(users.id, used.userId));
    // Şifre değişince tüm açık oturumlar kapatılır.
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: now })
      .where(and(eq(refreshTokens.userId, used.userId), isNull(refreshTokens.revokedAt)));
    await this.audit.record({ action: 'auth.password_changed', userId: used.userId, ...client });
  }

  private async createToken(userId: string, ttlMs: number) {
    const token = generateToken();
    await this.db.insert(passwordResetTokens).values({
      userId,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + ttlMs),
    });
    return token;
  }
}
