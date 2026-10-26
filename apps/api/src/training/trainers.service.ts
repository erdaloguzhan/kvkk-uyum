import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, ne, sql } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';
import { MailerService } from '../auth/mailer.service';
import { PasswordResetService } from '../auth/password-reset.service';
import { generateToken, hashPassword } from '../common/crypto';
import { blindIndex } from '../common/field-crypto';
import { AppConfig, CONFIG } from '../config';
import { Database, InjectDb } from '../db/db.module';
import { memberships, trainers, users } from '../db/schema';
import PDFDocument from 'pdfkit';
import { z } from 'zod';
import { trainerCreateBody, trainerUpdateBody } from './training.schema';

const SIGNATURE_TYPES = ['image/png', 'image/jpeg'];

/** Görsel PDF'e eklenebiliyor mu (bozuk veya desteklenmeyen PNG sertifika üretimini bozmasın). */
function embeddable(buffer: Buffer) {
  try {
    new PDFDocument().image(buffer, 0, 0, { width: 10 });
    return true;
  } catch {
    return false;
  }
}

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
        title: trainers.title,
        hasSignature: sql<boolean>`${trainers.signature} is not null`,
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
      .values({ ...profile, nationalIdHash: blindIndex(profile.nationalId), userId: user.id })
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
    const { email: rawEmail, ...profile } = input;
    if (profile.nationalId && profile.nationalId !== current.nationalId) await this.ensureNationalIdFree(profile.nationalId);
    const email = rawEmail?.trim();
    // E-posta kullanıcı adıdır; değişirse kullanıcı hesabında da değişir.
    if (email && email.toLowerCase() !== current.email.toLowerCase()) {
      const [taken] = await this.db
        .select({ id: users.id })
        .from(users)
        .where(and(sql`lower(${users.email}) = lower(${email})`, ne(users.id, current.userId)));
      if (taken) throw new ConflictException('Bu e-posta adresi başka bir kullanıcıya ait');
      await this.db.update(users).set({ email }).where(eq(users.id, current.userId));
    }
    if (Object.keys(profile).length) {
      await this.db
        .update(trainers)
        .set({ ...profile, ...(profile.nationalId && { nationalIdHash: blindIndex(profile.nationalId) }), updatedAt: new Date() })
        .where(eq(trainers.id, id));
    }
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

  /**
   * Eğitimciyi siler. Eğitimlerdeki eğitimci alanı boşalır. Kullanıcı hesabı yalnızca eğitimci için açıldıysa
   * (kuruluş üyeliği yok, platform yöneticisi değil) o da silinir; değilse hesap kalır, yalnızca eğitimci yetkisi gider.
   */
  async remove(adminId: string, id: string) {
    const t = await this.get(id);
    await this.db.delete(trainers).where(eq(trainers.id, id));
    const [user] = await this.db
      .select({ isPlatformAdmin: users.isPlatformAdmin })
      .from(users)
      .where(eq(users.id, t.userId));
    const [membership] = await this.db
      .select({ id: memberships.id })
      .from(memberships)
      .where(eq(memberships.userId, t.userId))
      .limit(1);
    const accountRemoved = !!user && !user.isPlatformAdmin && !membership;
    if (accountRemoved) await this.db.delete(users).where(eq(users.id, t.userId));
    await this.audit.record({
      action: 'training.trainer_deleted',
      userId: adminId,
      entityType: 'trainer',
      entityId: id,
      metadata: { email: t.email, accountRemoved },
    });
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

  /** Sertifikadaki imza görseli. PDF'e gömülebilmesi için yalnızca PNG veya JPEG kabul edilir. */
  async setSignature(adminId: string, id: string, file: { buffer: Buffer; mimetype: string }) {
    await this.get(id);
    if (!SIGNATURE_TYPES.includes(file.mimetype) || !embeddable(file.buffer)) {
      throw new BadRequestException('İmza PNG veya JPEG görsel olmalı');
    }
    await this.db
      .update(trainers)
      .set({ signature: file.buffer, signatureMime: file.mimetype, updatedAt: new Date() })
      .where(eq(trainers.id, id));
    await this.audit.record({ action: 'training.trainer_signature_set', userId: adminId, entityType: 'trainer', entityId: id });
  }

  async removeSignature(adminId: string, id: string) {
    await this.get(id);
    await this.db.update(trainers).set({ signature: null, signatureMime: null, updatedAt: new Date() }).where(eq(trainers.id, id));
    await this.audit.record({ action: 'training.trainer_signature_removed', userId: adminId, entityType: 'trainer', entityId: id });
  }

  async signature(id: string) {
    const [row] = await this.db
      .select({ content: trainers.signature, mimeType: trainers.signatureMime })
      .from(trainers)
      .where(eq(trainers.id, id));
    if (!row?.content || !row.mimeType) throw new NotFoundException('İmza bulunamadı');
    return { content: row.content, mimeType: row.mimeType };
  }

  private async ensureNationalIdFree(nationalId: string) {
    const [dup] = await this.db.select({ id: trainers.id }).from(trainers).where(eq(trainers.nationalIdHash, blindIndex(nationalId)));
    if (dup) throw new ConflictException('Bu T.C. kimlik no ile kayıtlı bir eğitimci var');
  }
}
