import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';
import { MailerService } from '../auth/mailer.service';
import { PasswordResetService } from '../auth/password-reset.service';
import { generateToken, hashPassword } from '../common/crypto';
import { AppConfig, CONFIG } from '../config';
import { Database, InjectDb } from '../db/db.module';
import { trainers, users } from '../db/schema';
import { z } from 'zod';
import { trainerCreateBody, trainerUpdateBody } from './training.schema';

const byTurkish = (a: string, b: string) => a.localeCompare(b, 'tr');

/** Eğitimciler (yönetim paneli, yalnızca platform yöneticisi). */
@Injectable()
export class TrainersService {
  constructor(
    @InjectDb() private readonly db: Database,
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly passwordReset: PasswordResetService,
    private readonly mailer: MailerService,
    private readonly audit: AuditService,
  ) {}

  async list() {
    const rows = await this.db
      .select({
        id: trainers.id,
        userId: trainers.userId,
        nationalId: trainers.nationalId,
        firstName: trainers.firstName,
        lastName: trainers.lastName,
        hireDate: trainers.hireDate,
        terminationDate: trainers.terminationDate,
        phone: trainers.phone,
        email: users.email,
        isActive: trainers.isActive,
        createdAt: trainers.createdAt,
      })
      .from(trainers)
      .innerJoin(users, eq(users.id, trainers.userId));
    return rows.sort((a, b) => byTurkish(`${a.firstName} ${a.lastName}`, `${b.firstName} ${b.lastName}`));
  }

  async get(id: string) {
    const row = (await this.list()).find((t) => t.id === id);
    if (!row) throw new NotFoundException('Eğitimci bulunamadı');
    return row;
  }

  /**
   * Eğitimciyi ekler. Bu e-postayla kullanıcı hesabı yoksa açılır ve şifre oluşturma bağlantısı gönderilir;
   * varsa (ör. platform yöneticisi) hesabına eğitimci yetkisi eklenir.
   */
  async create(adminId: string, input: z.infer<typeof trainerCreateBody>) {
    const { email: rawEmail, ...profile } = input;
    const email = rawEmail.trim();
    await this.ensureNationalIdFree(profile.nationalId);
    const fullName = `${profile.firstName} ${profile.lastName}`;
    let [user] = await this.db
      .select({ id: users.id, email: users.email, fullName: users.fullName })
      .from(users)
      .where(sql`lower(${users.email}) = lower(${email})`);
    const newUser = !user;
    if (user) {
      const [existing] = await this.db.select({ id: trainers.id }).from(trainers).where(eq(trainers.userId, user.id));
      if (existing) throw new ConflictException('Bu e-posta adresiyle kayıtlı bir eğitimci var');
    } else {
      [user] = await this.db
        .insert(users)
        .values({ email, fullName, passwordHash: await hashPassword(generateToken()) })
        .returning({ id: users.id, email: users.email, fullName: users.fullName });
    }
    const [trainer] = await this.db
      .insert(trainers)
      .values({ ...profile, userId: user.id })
      .returning({ id: trainers.id });

    const intro = 'KVK Yönetim Sistemi eğitim yönetimi için eğitimci hesabınız oluşturuldu.';
    if (newUser) {
      await this.passwordReset.sendInvite(user, null, { subject: 'KVK Yönetim Sistemi - eğitimci hesabınız', intro });
    } else {
      await this.mailer.send({
        to: user.email,
        subject: 'KVK Yönetim Sistemi - eğitimci hesabınız',
        text:
          `Merhaba ${user.fullName},\n\n${intro}\n\n` +
          `Mevcut şifrenizle yönetim paneline giriş yapabilirsiniz: ${this.config.appUrl}/admin\n` +
          `Kullanıcı adınız bu e-posta adresidir: ${user.email}\n`,
      });
    }
    await this.audit.record({
      action: 'training.trainer_created',
      userId: adminId,
      entityType: 'trainer',
      entityId: trainer.id,
      metadata: { email, newUser },
    });
    return this.get(trainer.id);
  }

  async update(adminId: string, id: string, input: z.infer<typeof trainerUpdateBody>) {
    const current = await this.get(id);
    if (input.nationalId && input.nationalId !== current.nationalId) await this.ensureNationalIdFree(input.nationalId);
    await this.db
      .update(trainers)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(trainers.id, id));
    if (input.firstName || input.lastName) {
      const fullName = `${input.firstName ?? current.firstName} ${input.lastName ?? current.lastName}`;
      await this.db.update(users).set({ fullName }).where(eq(users.id, current.userId));
    }
    await this.audit.record({
      action: 'training.trainer_updated',
      userId: adminId,
      entityType: 'trainer',
      entityId: id,
      metadata: { fields: Object.keys(input) },
    });
    return this.get(id);
  }

  /** Eğitimcinin şifre oluşturma bağlantısını yeniden gönderir (eskisi geçersiz olur). */
  async resendInvite(adminId: string, id: string) {
    const t = await this.get(id);
    await this.passwordReset.revokePending(t.userId);
    await this.passwordReset.sendInvite(
      { id: t.userId, email: t.email, fullName: `${t.firstName} ${t.lastName}` },
      null,
      {
        subject: 'KVK Yönetim Sistemi - eğitimci hesabınız',
        intro: 'KVK Yönetim Sistemi eğitim yönetimi için eğitimci hesabınız oluşturuldu.',
      },
    );
    await this.audit.record({ action: 'training.trainer_invite_resent', userId: adminId, entityType: 'trainer', entityId: id });
    return { email: t.email };
  }

  private async ensureNationalIdFree(nationalId: string) {
    const [dup] = await this.db.select({ id: trainers.id }).from(trainers).where(eq(trainers.nationalId, nationalId));
    if (dup) throw new ConflictException('Bu T.C. kimlik no ile kayıtlı bir eğitimci var');
  }
}
