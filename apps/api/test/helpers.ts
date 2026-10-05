import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { MailerService } from '../src/auth/mailer.service';
import { setupApp } from '../src/setup-app';

export const PASSWORD = 'GucluSifre123';

export async function createApp(): Promise<INestApplication> {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL ??= process.env.TEST_DATABASE_URL ?? 'postgres://postgres@localhost:5433/kvkk_test';
  process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-123';
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

export function extractCode(text: string) {
  return /: (\S+)\n/.exec(text)![1];
}

/** Kayıt + şifre + e-posta kodu ile giriş yapar. */
export async function registerAndLogin(app: INestApplication, email = uniqueEmail()) {
  const server = app.getHttpServer();
  await request(server)
    .post('/api/v1/auth/register')
    .send({ email, password: PASSWORD, fullName: 'Test Kullanıcı' })
    .expect(201);
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
