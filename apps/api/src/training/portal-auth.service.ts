import { HttpException, HttpStatus, Inject, Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { and, count, eq, gt, isNull, sql } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';
import { maskPhone, SmsService } from '../auth/sms.service';
import { generateNumericCode, generateToken, safeEqualHex, sha256 } from '../common/crypto';
import { AppConfig, CONFIG } from '../config';
import { Database, InjectDb } from '../db/db.module';
import { employees, portalLoginCodes } from '../db/schema';

/** Eğitim portalı oturumu; yenileme yoktur, süre dolunca yeniden giriş yapılır. */
export const PORTAL_TOKEN_TTL_SECONDS = 4 * 60 * 60;
const CODE_TTL_MS = 5 * 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;
/** Bir telefona gönderilebilecek kod sayısı: SMS yağdırmayı ve faturanın şişmesini önler. */
const CODES_PER_10_MIN = 3;
const CODES_PER_DAY = 10;

interface ClientInfo {
  ip: string | null;
  userAgent: string | null;
}

export interface TraineeToken {
  /** Çalışanın cep telefonu; çalışan kayıtları buna göre bulunur. */
  sub: string;
  /** Oturum kimliği: eğitim ilerlemesi oturuma bağlıdır. */
  sid: string;
  typ: 'trainee';
}

/**
 * Eğitim portalı girişi. Şifre yoktur: kullanıcı adı cep telefonudur, her girişte SMS ile tek kullanımlık kod
 * gönderilir (Erdal, 26.10.2026). Telefon, çalışan kayıtlarındaki cep telefonudur; aynı kişinin farklı
 * kuruluşlardaki kayıtları aynı telefonla tek girişte görünür.
 */
@Injectable()
export class PortalAuthService {
  private readonly logger = new Logger(PortalAuthService.name);

  constructor(
    @InjectDb() private readonly db: Database,
    private readonly jwt: JwtService,
    private readonly sms: SmsService,
    private readonly audit: AuditService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  get portalUrl() {
    return `${this.config.appUrl}/egitim`;
  }

  /**
   * 1. adım: telefon bir çalışan kaydında varsa SMS ile kod gönderilir. Yanıt her durumda aynıdır; telefonun
   * kayıtlı olup olmadığı anlaşılamaz.
   */
  async requestCode(phone: string, client: ClientInfo) {
    const now = Date.now();
    const [recent] = await this.db
      .select({ day: count(), short: sql<number>`count(*) filter (where ${portalLoginCodes.createdAt} > ${new Date(now - 10 * 60 * 1000)})` })
      .from(portalLoginCodes)
      .where(and(eq(portalLoginCodes.phone, phone), gt(portalLoginCodes.createdAt, new Date(now - 24 * 60 * 60 * 1000))));
    if (Number(recent.short) >= CODES_PER_10_MIN || recent.day >= CODES_PER_DAY) {
      throw new HttpException('Çok fazla kod istendi. Lütfen biraz sonra tekrar deneyin.', HttpStatus.TOO_MANY_REQUESTS);
    }

    // Önceki kodlar geçersiz olur: aynı anda birden çok kod üzerinde deneme yapılamaz.
    await this.db
      .update(portalLoginCodes)
      .set({ consumedAt: new Date() })
      .where(and(eq(portalLoginCodes.phone, phone), isNull(portalLoginCodes.consumedAt)));
    const code = generateNumericCode();
    const [challenge] = await this.db
      .insert(portalLoginCodes)
      .values({ phone, codeHash: sha256(code), expiresAt: new Date(now + CODE_TTL_MS) })
      .returning({ id: portalLoginCodes.id });

    if (await this.isKnown(phone)) {
      try {
        await this.sms.send({ to: phone, text: `KVK Uyum Eğitim Portalı giriş kodunuz: ${code}\nKod 5 dakika geçerlidir, kimseyle paylaşmayın.` });
      } catch (err) {
        this.logger.error(`Portal giriş kodu SMS ile gönderilemedi: ${err}`);
        throw new ServiceUnavailableException('SMS gönderilemedi. Lütfen biraz sonra tekrar deneyin.');
      }
      await this.audit.record({ action: 'training.portal_code_sent', metadata: { phone }, ...client });
    } else {
      await this.audit.record({ action: 'training.portal_code_unknown_phone', metadata: { phone }, ...client });
    }
    return { challengeId: challenge.id, expiresInSeconds: CODE_TTL_MS / 1000, destination: maskPhone(phone) };
  }

  /** 2. adım: kod doğrulanır, portal oturumu açılır. */
  async login(input: { challengeId: string; code: string }, client: ClientInfo) {
    const [challenge] = await this.db.select().from(portalLoginCodes).where(eq(portalLoginCodes.id, input.challengeId));
    const invalid = () => new UnauthorizedException('Kod hatalı veya süresi dolmuş');
    if (!challenge || challenge.consumedAt || challenge.expiresAt < new Date() || challenge.attempts >= MAX_CODE_ATTEMPTS) {
      throw invalid();
    }
    if (!safeEqualHex(sha256(input.code), challenge.codeHash)) {
      await this.db
        .update(portalLoginCodes)
        .set({ attempts: sql`${portalLoginCodes.attempts} + 1` })
        .where(eq(portalLoginCodes.id, challenge.id));
      await this.audit.record({ action: 'training.portal_login_failed', metadata: { phone: challenge.phone }, ...client });
      throw invalid();
    }
    // Kodun yalnızca bir kez kullanılabilmesi için koşullu güncelleme.
    const consumed = await this.db
      .update(portalLoginCodes)
      .set({ consumedAt: new Date() })
      .where(and(eq(portalLoginCodes.id, challenge.id), isNull(portalLoginCodes.consumedAt)))
      .returning({ id: portalLoginCodes.id });
    if (consumed.length === 0 || !(await this.isKnown(challenge.phone))) throw invalid();

    await this.audit.record({ action: 'training.portal_login', metadata: { phone: challenge.phone }, ...client });
    const payload: TraineeToken = { sub: challenge.phone, sid: generateToken(12), typ: 'trainee' };
    const token = await this.jwt.signAsync(payload, { expiresIn: PORTAL_TOKEN_TTL_SECONDS });
    return { token, expiresInSeconds: PORTAL_TOKEN_TTL_SECONDS, account: { phone: challenge.phone } };
  }

  /** Bu telefonla kayıtlı bir çalışan var mı. */
  async isKnown(phone: string) {
    const [row] = await this.db.select({ id: employees.id }).from(employees).where(eq(employees.phone, phone)).limit(1);
    return !!row;
  }
}
