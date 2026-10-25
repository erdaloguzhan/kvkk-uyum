import { BadRequestException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { randomInt } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { MailerService } from '../auth/mailer.service';
import { DUMMY_PASSWORD_HASH, generateToken, hashPassword, sha256, verifyPassword } from '../common/crypto';
import { AppConfig, CONFIG } from '../config';
import { Database, InjectDb } from '../db/db.module';
import { employees, trainingAccounts, trainingAccountTokens } from '../db/schema';

/** Eğitim portalı oturumu; yenileme yoktur, süre dolunca yeniden giriş yapılır. */
export const PORTAL_TOKEN_TTL_SECONDS = 4 * 60 * 60;
const MAX_FAILED_LOGINS = 5;
const LOCK_MS = 15 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;
const INVALID_CREDENTIALS = 'Cep telefonu veya şifre hatalı';

interface ClientInfo {
  ip: string | null;
  userAgent: string | null;
}

export interface TraineeToken {
  sub: string;
  email: string;
  /** Oturum kimliği: eğitim ilerlemesi oturuma bağlıdır. */
  sid: string;
  typ: 'trainee';
}

/** Geçici şifre: karışmaya açık harfler (I, l, O, 0) olmadan, şifre politikasına uygun 12 karakter. */
export function temporaryPassword(): string {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';
  const all = letters + digits;
  const chars = [letters[randomInt(letters.length)], digits[randomInt(digits.length)]];
  while (chars.length < 12) chars.push(all[randomInt(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

/** Eğitim portalı hesapları: giriş, ilk girişte şifre değiştirme, şifremi unuttum. */
@Injectable()
export class PortalAuthService {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly jwt: JwtService,
    private readonly mailer: MailerService,
    private readonly audit: AuditService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  get portalUrl() {
    return `${this.config.appUrl}/egitim`;
  }

  /**
   * Eğitim gönderilirken çağrılır. Hesap yoksa ya da hiç giriş yapılmamışsa (geçici şifre hâlâ geçerli)
   * yeni geçici şifre üretilir ve döner; şifresini belirlemiş hesapta null döner (mevcut şifre geçerli).
   */
  async issueCredentials(email: string): Promise<{ accountId: string; temporaryPassword: string | null }> {
    const existing = await this.findByEmail(email);
    if (existing && !existing.mustChangePassword) return { accountId: existing.id, temporaryPassword: null };
    const password = temporaryPassword();
    const passwordHash = await hashPassword(password);
    if (existing) {
      await this.db
        .update(trainingAccounts)
        .set({ passwordHash, failedLoginCount: 0, lockedUntil: null })
        .where(eq(trainingAccounts.id, existing.id));
      return { accountId: existing.id, temporaryPassword: password };
    }
    const [row] = await this.db
      .insert(trainingAccounts)
      .values({ email: email.trim(), passwordHash })
      .returning({ id: trainingAccounts.id });
    return { accountId: row.id, temporaryPassword: password };
  }

  /**
   * Kullanıcı adı cep telefonudur. Hesaplar e-postaya bağlı olduğundan telefon, çalışan kayıtlarından e-postaya
   * çevrilir. Aynı telefon farklı e-postalı kayıtlarda varsa (eski veri) şifresi tutan hesap seçilir.
   */
  async login(input: { phone: string; password: string }, client: ClientInfo) {
    const accounts = await this.findByPhone(input.phone);
    if (accounts.length === 0) {
      await verifyPassword(input.password, DUMMY_PASSWORD_HASH);
      await this.audit.record({ action: 'training.portal_login_failed', metadata: { phone: input.phone }, ...client });
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    let account: (typeof accounts)[number] | undefined;
    for (const candidate of accounts) {
      if (candidate.lockedUntil && candidate.lockedUntil > new Date()) {
        if (accounts.length === 1) throw new UnauthorizedException('Hesap geçici olarak kilitlendi. Lütfen daha sonra tekrar deneyin.');
        continue;
      }
      if (await verifyPassword(input.password, candidate.passwordHash)) {
        account = candidate;
        break;
      }
    }
    if (!account) {
      for (const candidate of accounts) await this.recordFailure(candidate, client);
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    await this.db
      .update(trainingAccounts)
      .set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() })
      .where(eq(trainingAccounts.id, account.id));
    await this.audit.record({ action: 'training.portal_login', entityType: 'training_account', entityId: account.id, ...client });
    return this.issueToken(account);
  }

  /** İlk girişte (geçici şifre) veya istendiğinde şifre değiştirme. Oturum kimliği korunur. */
  async changePassword(token: TraineeToken, input: { currentPassword: string; newPassword: string }, client: ClientInfo) {
    const account = await this.findById(token.sub);
    if (!(await verifyPassword(input.currentPassword, account.passwordHash))) {
      await this.recordFailure(account, client);
      throw new BadRequestException('Mevcut şifre hatalı');
    }
    if (input.currentPassword === input.newPassword) {
      throw new BadRequestException('Yeni şifre mevcut şifreden farklı olmalı');
    }
    await this.db
      .update(trainingAccounts)
      .set({ passwordHash: await hashPassword(input.newPassword), mustChangePassword: false, failedLoginCount: 0 })
      .where(eq(trainingAccounts.id, account.id));
    await this.audit.record({ action: 'training.portal_password_changed', entityType: 'training_account', entityId: account.id, ...client });
    return this.issueToken({ ...account, mustChangePassword: false }, token.sid);
  }

  /** Bağlantı hesabın e-postasına gider. Hesap yoksa da aynı yanıt döner (telefonun kayıtlı olduğu sızdırılmaz). */
  async requestReset(phone: string, client: ClientInfo) {
    for (const account of await this.findByPhone(phone)) await this.sendReset(account, client);
  }

  private async sendReset(account: typeof trainingAccounts.$inferSelect, client: ClientInfo) {
    const token = generateToken();
    await this.db.insert(trainingAccountTokens).values({
      accountId: account.id,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + RESET_TTL_MS),
    });
    await this.mailer.send({
      to: account.email,
      subject: 'Eğitim Portalı şifre sıfırlama',
      text:
        `Eğitim Portalı şifrenizi sıfırlamak için aşağıdaki bağlantıyı açın:\n` +
        `${this.portalUrl}/sifre-belirle?kod=${encodeURIComponent(token)}\n\n` +
        `Bağlantı 1 saat geçerlidir. Bu isteği siz yapmadıysanız bu e-postayı dikkate almayın.`,
    });
    await this.audit.record({ action: 'training.portal_reset_requested', entityType: 'training_account', entityId: account.id, ...client });
  }

  async confirmReset(token: string, newPassword: string, client: ClientInfo) {
    const now = new Date();
    const [used] = await this.db
      .update(trainingAccountTokens)
      .set({ usedAt: now })
      .where(
        and(
          eq(trainingAccountTokens.tokenHash, sha256(token)),
          isNull(trainingAccountTokens.usedAt),
          gt(trainingAccountTokens.expiresAt, now),
        ),
      )
      .returning({ accountId: trainingAccountTokens.accountId });
    if (!used) throw new BadRequestException('Bağlantı geçersiz veya süresi dolmuş');
    await this.db
      .update(trainingAccounts)
      .set({ passwordHash: await hashPassword(newPassword), mustChangePassword: false, failedLoginCount: 0, lockedUntil: null })
      .where(eq(trainingAccounts.id, used.accountId));
    await this.audit.record({ action: 'training.portal_password_changed', entityType: 'training_account', entityId: used.accountId, ...client });
  }

  async findById(id: string) {
    const [account] = await this.db.select().from(trainingAccounts).where(eq(trainingAccounts.id, id));
    if (!account) throw new UnauthorizedException();
    return account;
  }

  private async recordFailure(account: typeof trainingAccounts.$inferSelect, client: ClientInfo) {
    const failed = account.failedLoginCount + 1;
    const lock = failed >= MAX_FAILED_LOGINS;
    await this.db
      .update(trainingAccounts)
      .set({
        failedLoginCount: lock ? 0 : failed,
        lockedUntil: lock ? new Date(Date.now() + LOCK_MS) : account.lockedUntil,
      })
      .where(eq(trainingAccounts.id, account.id));
    await this.audit.record({
      action: lock ? 'training.portal_account_locked' : 'training.portal_login_failed',
      entityType: 'training_account',
      entityId: account.id,
      ...client,
    });
  }

  private async issueToken(account: { id: string; email: string; mustChangePassword: boolean }, sid = generateToken(12)) {
    const payload: TraineeToken = { sub: account.id, email: account.email, sid, typ: 'trainee' };
    const token = await this.jwt.signAsync(payload, { expiresIn: PORTAL_TOKEN_TTL_SECONDS });
    return {
      token,
      expiresInSeconds: PORTAL_TOKEN_TTL_SECONDS,
      account: { email: account.email, mustChangePassword: account.mustChangePassword },
    };
  }

  /** Bu cep telefonuyla kayıtlı çalışanların e-postalarına ait portal hesapları. */
  private async findByPhone(phone: string) {
    const rows = await this.db
      .selectDistinct({ account: trainingAccounts })
      .from(employees)
      .innerJoin(trainingAccounts, sql`lower(${trainingAccounts.email}) = lower(${employees.email})`)
      .where(eq(employees.phone, phone));
    return rows.map((r) => r.account);
  }

  private async findByEmail(email: string) {
    const [account] = await this.db
      .select()
      .from(trainingAccounts)
      .where(sql`lower(${trainingAccounts.email}) = lower(${email.trim()})`);
    return account;
  }
}
