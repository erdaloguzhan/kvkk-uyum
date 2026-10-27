import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';
import {
  DUMMY_PASSWORD_HASH,
  generateNumericCode,
  generateToken,
  hashPassword,
  safeEqualHex,
  sha256,
  verifyPassword,
} from '../common/crypto';
import { Database, InjectDb } from '../db/db.module';
import { loginChallenges, memberships, organizations, refreshTokens, roles, trainers, users } from '../db/schema';
import { accountRoleLabel, salutation, SYSTEM_NAME } from './account-label';
import { MailerService } from './mailer.service';
import { maskPhone, SmsService } from './sms.service';

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;
const MAX_FAILED_LOGINS = 5;
const LOCK_MS = 15 * 60 * 1000;

interface ClientInfo {
  ip: string | null;
  userAgent: string | null;
}

const INVALID_CREDENTIALS = 'E-posta veya şifre hatalı';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectDb() private readonly db: Database,
    private readonly jwt: JwtService,
    private readonly mailer: MailerService,
    private readonly sms: SmsService,
    private readonly audit: AuditService,
  ) {}

  /**
   * 1. adım: şifre doğrulanır, doğrulama kodu cep telefonuna SMS ile gönderilir (Erdal, 26.10.2026: tüm panel
   * girişlerinde). Cep telefonu kayıtlı olmayan hesapta kod e-postaya gider.
   */
  async login(input: { email: string; password: string }, client: ClientInfo) {
    const user = await this.findUserByEmail(input.email);
    if (!user || !user.isActive) {
      // Kayıtlı olmayan adres de şifre doğrulaması kadar sürer; yanıt süresinden adresin sistemde olup olmadığı anlaşılamaz.
      await verifyPassword(input.password, DUMMY_PASSWORD_HASH);
      await this.audit.record({ action: 'auth.login_failed', metadata: { email: input.email }, ...client });
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      await this.audit.record({ action: 'auth.login_locked', userId: user.id, ...client });
      throw new UnauthorizedException('Hesap geçici olarak kilitlendi. Lütfen daha sonra tekrar deneyin.');
    }

    if (!(await verifyPassword(input.password, user.passwordHash))) {
      const failed = user.failedLoginCount + 1;
      const lock = failed >= MAX_FAILED_LOGINS;
      await this.db
        .update(users)
        .set({
          failedLoginCount: lock ? 0 : failed,
          lockedUntil: lock ? new Date(Date.now() + LOCK_MS) : user.lockedUntil,
        })
        .where(eq(users.id, user.id));
      await this.audit.record({
        action: lock ? 'auth.account_locked' : 'auth.login_failed',
        userId: user.id,
        ...client,
      });
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    // Önceki kodlar geçersiz olur: aynı anda birden çok kod üzerinde deneme yapılamaz.
    await this.db
      .update(loginChallenges)
      .set({ consumedAt: new Date() })
      .where(and(eq(loginChallenges.userId, user.id), isNull(loginChallenges.consumedAt)));
    const code = generateNumericCode();
    const [challenge] = await this.db
      .insert(loginChallenges)
      .values({
        userId: user.id,
        codeHash: sha256(code),
        expiresAt: new Date(Date.now() + CODE_TTL_MS),
      })
      .returning({ id: loginChallenges.id });

    const roleLabel = await accountRoleLabel(this.db, user.id);
    let viaSms = !!user.phone && this.sms.available;
    if (viaSms) {
      try {
        await this.sms.send({ to: user.phone!, text: `KVK Uyum giriş kodunuz: ${code}\nKod 10 dakika geçerlidir, kimseyle paylaşmayın.` });
      } catch (err) {
        // SMS servisi çalışmıyorsa giriş kilitlenmesin: kod e-postayla gider.
        this.logger.error(`Giriş kodu SMS ile gönderilemedi, e-postayla gönderiliyor: ${err}`);
        viaSms = false;
      }
    }
    if (!viaSms) {
      await this.mailer.send({
        to: user.email,
        subject: `${SYSTEM_NAME} giriş kodu`,
        text:
          `${salutation(user.fullName)}\n\n` +
          `${SYSTEM_NAME}ne ${roleLabel ? `${roleLabel} olarak ` : ''}giriş kodunuz: ${code}\n` +
          'Kod 10 dakika geçerlidir, kimseyle paylaşmayın.\n',
      });
    }
    await this.audit.record({ action: 'auth.code_sent', userId: user.id, metadata: { channel: viaSms ? 'sms' : 'email' }, ...client });
    return {
      challengeId: challenge.id,
      expiresInSeconds: CODE_TTL_MS / 1000,
      channel: viaSms ? ('sms' as const) : ('email' as const),
      destination: viaSms ? maskPhone(user.phone!) : null,
      // Doğrulama kodu penceresindeki hitap için; şifre doğrulandıktan sonra döner.
      fullName: user.fullName,
      roleLabel,
    };
  }

  /** 2. adım: doğrulama kodu kontrol edilir, belirteçler verilir. */
  async verifyCode(input: { challengeId: string; code: string }, client: ClientInfo) {
    const [challenge] = await this.db
      .select()
      .from(loginChallenges)
      .where(eq(loginChallenges.id, input.challengeId));

    const invalid = () => new UnauthorizedException('Doğrulama kodu hatalı veya süresi dolmuş');
    if (
      !challenge ||
      challenge.consumedAt ||
      challenge.expiresAt < new Date() ||
      challenge.attempts >= MAX_CODE_ATTEMPTS
    ) {
      throw invalid();
    }

    if (!safeEqualHex(sha256(input.code), challenge.codeHash)) {
      await this.db
        .update(loginChallenges)
        .set({ attempts: sql`${loginChallenges.attempts} + 1` })
        .where(eq(loginChallenges.id, challenge.id));
      await this.audit.record({ action: 'auth.code_failed', userId: challenge.userId, ...client });
      throw invalid();
    }

    // Kodun yalnızca bir kez kullanılabilmesi için koşullu güncelleme.
    const consumed = await this.db
      .update(loginChallenges)
      .set({ consumedAt: new Date() })
      .where(and(eq(loginChallenges.id, challenge.id), isNull(loginChallenges.consumedAt)))
      .returning({ id: loginChallenges.id });
    if (consumed.length === 0) throw invalid();

    const [user] = await this.db.select().from(users).where(eq(users.id, challenge.userId));
    if (!user.isActive) throw invalid();
    await this.db
      .update(users)
      .set({ failedLoginCount: 0, lockedUntil: null })
      .where(eq(users.id, user.id));
    await this.audit.record({ action: 'auth.login', userId: user.id, ...client });
    return this.issueTokens(user);
  }

  async refresh(refreshToken: string) {
    const now = new Date();
    const [revoked] = await this.db
      .update(refreshTokens)
      .set({ revokedAt: now })
      .where(
        and(
          eq(refreshTokens.tokenHash, sha256(refreshToken)),
          isNull(refreshTokens.revokedAt),
          gt(refreshTokens.expiresAt, now),
        ),
      )
      .returning({ userId: refreshTokens.userId });
    if (!revoked) throw new UnauthorizedException('Oturum süresi doldu, tekrar giriş yapın');

    const [user] = await this.db.select().from(users).where(eq(users.id, revoked.userId));
    if (!user?.isActive) throw new UnauthorizedException();
    return this.issueTokens(user);
  }

  async logout(refreshToken: string, userId: string, client: ClientInfo) {
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(refreshTokens.tokenHash, sha256(refreshToken)),
          eq(refreshTokens.userId, userId),
          isNull(refreshTokens.revokedAt),
        ),
      );
    await this.audit.record({ action: 'auth.logout', userId, ...client });
  }

  /**
   * Oturum açmış kullanıcının şifre değiştirmesi: mevcut şifre doğrulanır, yanlış girişler girişteki gibi
   * sayılır ve hesabı kilitler. Başarılı olunca tüm açık oturumlar kapatılır ve bu oturum için yeni
   * belirteçler verilir.
   */
  async changePassword(
    userId: string,
    input: { currentPassword: string; newPassword: string },
    client: ClientInfo,
  ) {
    const [user] = await this.db.select().from(users).where(eq(users.id, userId));
    if (!user?.isActive) throw new UnauthorizedException();
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new BadRequestException('Hesap geçici olarak kilitlendi. Lütfen daha sonra tekrar deneyin.');
    }

    if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
      const failed = user.failedLoginCount + 1;
      const lock = failed >= MAX_FAILED_LOGINS;
      await this.db
        .update(users)
        .set({
          failedLoginCount: lock ? 0 : failed,
          lockedUntil: lock ? new Date(Date.now() + LOCK_MS) : user.lockedUntil,
        })
        .where(eq(users.id, user.id));
      await this.audit.record({
        action: lock ? 'auth.account_locked' : 'auth.password_change_failed',
        userId: user.id,
        ...client,
      });
      throw new BadRequestException('Mevcut şifre hatalı');
    }
    if (input.currentPassword === input.newPassword) {
      throw new BadRequestException('Yeni şifre mevcut şifreden farklı olmalı');
    }

    const now = new Date();
    await this.db
      .update(users)
      .set({ passwordHash: await hashPassword(input.newPassword), failedLoginCount: 0, lockedUntil: null })
      .where(eq(users.id, user.id));
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: now })
      .where(and(eq(refreshTokens.userId, user.id), isNull(refreshTokens.revokedAt)));
    await this.audit.record({ action: 'auth.password_changed', userId: user.id, ...client });
    return this.issueTokens(user);
  }

  async me(userId: string) {
    const [user] = await this.db
      .select({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        phone: users.phone,
        isPlatformAdmin: users.isPlatformAdmin,
        trainerActive: trainers.isActive,
      })
      .from(users)
      .leftJoin(trainers, eq(trainers.userId, users.id))
      .where(eq(users.id, userId));
    if (!user) throw new UnauthorizedException();
    const { trainerActive, ...profile } = user;

    const orgs = await this.db
      .select({
        id: organizations.id,
        name: organizations.name,
        licenseStatus: organizations.licenseStatus,
        licenseExpiresAt: organizations.licenseExpiresAt,
        setupCompletedAt: organizations.setupCompletedAt,
        role: { key: roles.key, name: roles.name, permissions: roles.permissions },
      })
      .from(memberships)
      .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
      .innerJoin(roles, eq(roles.id, memberships.roleId))
      .where(and(eq(memberships.userId, userId), eq(memberships.status, 'active')))
      .orderBy(organizations.name);
    // Aktif eğitimci yönetim panelinde yalnızca eğitim bölümünü görür.
    return { ...profile, isTrainer: trainerActive === true, organizations: orgs };
  }

  private async issueTokens(user: { id: string; email: string; fullName: string }) {
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, email: user.email, typ: 'access' },
      { expiresIn: ACCESS_TOKEN_TTL_SECONDS },
    );
    const refreshToken = generateToken();
    await this.db.insert(refreshTokens).values({
      userId: user.id,
      tokenHash: sha256(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    });
    return {
      accessToken,
      refreshToken,
      expiresInSeconds: ACCESS_TOKEN_TTL_SECONDS,
      user: { id: user.id, email: user.email, fullName: user.fullName },
    };
  }

  private async findUserByEmail(email: string) {
    const [user] = await this.db
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = lower(${email.trim()})`);
    return user;
  }
}
