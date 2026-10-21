import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { MailerService } from '../src/auth/mailer.service';
import { hashPassword } from '../src/common/crypto';
import { setupApp } from '../src/setup-app';
import { Database, DB } from '../src/db/db.module';
import { users } from '../src/db/schema';
import { MembersService } from '../src/members/members.service';
import { OrganizationProfile, OrganizationsService } from '../src/organizations/organizations.service';
import { eq } from 'drizzle-orm';

export const PASSWORD = 'GucluSifre123';

export async function createApp(): Promise<INestApplication> {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL ??= process.env.TEST_DATABASE_URL ?? 'postgres://postgres@localhost:5433/kvkk_test';
  process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-123';
  process.env.DATA_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString('base64');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  setupApp(app);
  await app.init();
  return app;
}

export function uniqueEmail(prefix = 'user') {
  return `${prefix}-${randomUUID().slice(0, 8)}@ornek.com.tr`;
}

export function lastMailTo(app: INestApplication, email: string) {
  const outbox = app.get(MailerService).outbox;
  const mail = [...outbox].reverse().find((m) => m.to === email);
  if (!mail) throw new Error(`No mail sent to ${email}`);
  return mail;
}

/** Gönderilmiş e-posta sayısı; `waitForMailTo` ile birlikte yalnızca bundan sonra gidenleri beklemek için. */
export function mailCount(app: INestApplication) {
  return app.get(MailerService).outbox.length;
}

/** Arka planda gönderilen e-postayı (ör. şifre sıfırlama) bekler; yalnızca `since` sırasından sonrakilere bakar. */
export async function waitForMailTo(app: INestApplication, email: string, since: number, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const mail = app
      .get(MailerService)
      .outbox.slice(since)
      .reverse()
      .find((m) => m.to === email);
    if (mail) return mail;
    if (Date.now() > deadline) throw new Error(`No mail sent to ${email}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

/** E-postadaki giriş kodu veya şifre belirleme bağlantısındaki kod. */
export function extractCode(text: string) {
  const link = /[?&]kod=([^\s&]+)/.exec(text);
  if (link) return decodeURIComponent(link[1]);
  return /: (\S+)\n/.exec(text)![1];
}

/** Kullanıcıyı doğrudan oluşturur (gerçekte hesaplar yönetim panelinden açılır; açık kayıt yoktur). */
export async function createUser(app: INestApplication, email = uniqueEmail(), password = PASSWORD) {
  const db = app.get<Database>(DB);
  const [user] = await db
    .insert(users)
    .values({ email, fullName: 'Test Kullanıcı', passwordHash: await hashPassword(password) })
    .returning({ id: users.id });
  return user;
}

/** Kullanıcı oluşturur, şifre + e-posta kodu ile giriş yapar. */
export async function registerAndLogin(app: INestApplication, email = uniqueEmail()) {
  await createUser(app, email);
  return login(app, email);
}

export async function login(app: INestApplication, email: string, password = PASSWORD) {
  const server = app.getHttpServer();
  const loginRes = await request(server)
    .post('/api/v1/auth/login')
    .send({ email, password })
    .expect(200);
  const code = extractCode(lastMailTo(app, email).text);
  const verifyRes = await request(server)
    .post('/api/v1/auth/verify')
    .send({ challengeId: loginRes.body.challengeId, code })
    .expect(200);
  return { email, ...verifyRes.body } as {
    email: string;
    accessToken: string;
    refreshToken: string;
    user: { id: string };
  };
}

/**
 * Kuruluşu doğrudan oluşturur ve `owner`ı "Sorumlu + Yönetici" yapar. Gerçekte kuruluşları
 * yönetim panelinden platform yöneticisi açar (admin.spec.ts).
 */
export async function createOrg(app: INestApplication, owner: { user: { id: string } }, profile: OrganizationProfile) {
  const org = await app.get(OrganizationsService).create(owner.user.id, profile);
  return org.id;
}

/** Kullanıcıyı platform yöneticisi yapar. */
export async function makePlatformAdmin(app: INestApplication, userId: string) {
  const db = app.get<Database>(DB);
  await db.update(users).set({ isPlatformAdmin: true }).where(eq(users.id, userId));
}

/**
 * Kuruluşa verilen rolle kullanıcı ekler (gerçekte yönetim panelinden yapılır), davetteki bağlantıyla
 * şifresini belirletir ve giriş yapar.
 */
export async function addMember(app: INestApplication, orgId: string, roleKey: string, fullName = 'Mehmet Demir') {
  const email = uniqueEmail('uye');
  const added = await app.get(MembersService).add(orgId, null, { email, fullName, roleKey });
  const token = extractCode(lastMailTo(app, email).text);
  await request(app.getHttpServer())
    .post('/api/v1/auth/password-reset/confirm')
    .send({ token, password: 'DavetSifre2026' })
    .expect(204);
  return { ...(await login(app, email, 'DavetSifre2026')), membershipId: added.membership.id };
}
