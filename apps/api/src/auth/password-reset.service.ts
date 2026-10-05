import { BadRequestException, Injectable } from '@nestjs/common';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';
import { generateToken, hashPassword, sha256 } from '../common/crypto';
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
      text: `Şifrenizi sıfırlamak için kodunuz: ${token}\nKod 1 saat geçerlidir.`,
    });
    await this.audit.record({ action: 'auth.password_reset_requested', userId: user.id, ...client });
  }

  /** Kuruluşa davet edilen yeni kullanıcıya şifre belirleme bağlantısı gönderir. */
  async sendInvite(user: { id: string; email: string }, organizationName: string) {
    const token = await this.createToken(user.id, INVITE_TTL_MS);
    await this.mailer.send({
      to: user.email,
      subject: `${organizationName} sizi KVK Yönetim Sistemine davet etti`,
      text: `Hesabınızı etkinleştirmek için şifrenizi belirleyin. Kodunuz: ${token}\nKod 7 gün geçerlidir.`,
    });
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
