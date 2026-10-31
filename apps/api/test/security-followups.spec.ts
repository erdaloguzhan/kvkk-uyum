import { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { Database, DB } from '../src/db/db.module';
import { organizations, users } from '../src/db/schema';
import {
  createApp,
  createOrg,
  extractCode,
  lastSmsTo,
  login,
  makePlatformAdmin,
  mailCount,
  PASSWORD,
  registerAndLogin,
  uniqueEmail,
  waitForMailTo,
} from './helpers';

/** Arka planda gönderilen SMS'i bekler. */
async function waitForSms(app: INestApplication, phone: string, previous?: string) {
  const deadline = Date.now() + 3000;
  for (;;) {
    try {
      const sms = lastSmsTo(app, phone);
      if (sms.text !== previous) return sms;
    } catch {
      /* henüz gönderilmedi */
    }
    if (Date.now() > deadline) throw new Error(`No SMS sent to ${phone}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

describe('Şifremi unuttum (SMS), oturum kapatma, lisans süresi', () => {
  let app: INestApplication;
  let server: any;
  let db: Database;

  beforeAll(async () => {
    app = await createApp();
    server = app.getHttpServer();
    db = app.get<Database>(DB);
  });
  afterAll(() => app.close());

  async function withPhone(phone: string) {
    const session = await registerAndLogin(app);
    await db.update(users).set({ phone }).where(eq(users.id, session.user.id));
    return session;
  }

  it('cep telefonu kayıtlı hesapta şifre SMS koduyla sıfırlanır, açık oturumlar hemen kapanır', async () => {
    const phone = '05329990011';
    const session = await withPhone(phone);
    const sent = mailCount(app);
    const res = await request(server).post('/api/v1/auth/password-reset/request').send({ email: session.email }).expect(202);
    expect(res.body).toEqual({ challengeId: expect.any(String), expiresInSeconds: 600 });

    const sms = await waitForSms(app, phone);
    expect(sms.text).toMatch(/^KVK Uyum şifre sıfırlama kodunuz: \d{6}\n/);
    const code = /(\d{6})/.exec(sms.text)![1];
    // E-postadaki bağlantı da gider.
    const mail = await waitForMailTo(app, session.email, sent);
    expect(mail.text).toContain('SMS ile gelen kodla da');
    const linkToken = extractCode(mail.text);

    const wrong = code === '000000' ? '111111' : '000000';
    await request(server)
      .post('/api/v1/auth/password-reset/confirm-code')
      .send({ challengeId: res.body.challengeId, code: wrong, password: 'YeniSifre4567' })
      .expect(400);
    await request(server)
      .post('/api/v1/auth/password-reset/confirm-code')
      .send({ challengeId: res.body.challengeId, code, password: 'kisa' })
      .expect(400);
    await request(server)
      .post('/api/v1/auth/password-reset/confirm-code')
      .send({ challengeId: res.body.challengeId, code, password: 'YeniSifre4567' })
      .expect(204);

    // Kod ikinci kez kullanılamaz; e-postadaki bağlantı da artık geçersiz.
    await request(server)
      .post('/api/v1/auth/password-reset/confirm-code')
      .send({ challengeId: res.body.challengeId, code, password: 'BaskaSifre4567' })
      .expect(400);
    await request(server).post('/api/v1/auth/password-reset/confirm').send({ token: linkToken, password: 'BaskaSifre4567' }).expect(400);

    // Eski erişim belirteci 15 dakikayı beklemeden geçersiz olur.
    await request(server).get('/api/v1/auth/me').set('Authorization', `Bearer ${session.accessToken}`).expect(401);
    await request(server).post('/api/v1/auth/refresh').send({ refreshToken: session.refreshToken }).expect(401);
    await request(server).post('/api/v1/auth/login').send({ email: session.email, password: PASSWORD }).expect(401);
    const fresh = await login(app, session.email, 'YeniSifre4567');
    await request(server).get('/api/v1/auth/me').set('Authorization', `Bearer ${fresh.accessToken}`).expect(200);
  });

  it('kayıtlı olmayan adres de aynı yanıtı alır; kod 5 yanlış denemeden sonra kullanılamaz', async () => {
    const unknown = await request(server).post('/api/v1/auth/password-reset/request').send({ email: uniqueEmail() }).expect(202);
    expect(unknown.body.challengeId).toEqual(expect.any(String));
    await request(server)
      .post('/api/v1/auth/password-reset/confirm-code')
      .send({ challengeId: unknown.body.challengeId, code: '123456', password: 'YeniSifre4567' })
      .expect(400);

    const phone = '05329990022';
    const session = await withPhone(phone);
    const res = await request(server).post('/api/v1/auth/password-reset/request').send({ email: session.email }).expect(202);
    const code = /(\d{6})/.exec((await waitForSms(app, phone)).text)![1];
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) {
      await request(server)
        .post('/api/v1/auth/password-reset/confirm-code')
        .send({ challengeId: res.body.challengeId, code: wrong, password: 'YeniSifre4567' })
        .expect(400);
    }
    await request(server)
      .post('/api/v1/auth/password-reset/confirm-code')
      .send({ challengeId: res.body.challengeId, code, password: 'YeniSifre4567' })
      .expect(400);
  });

  it('telefonu olmayan hesapta SMS gitmez, yalnızca e-posta bağlantısı gider', async () => {
    const session = await registerAndLogin(app);
    const sent = mailCount(app);
    await request(server).post('/api/v1/auth/password-reset/request').send({ email: session.email }).expect(202);
    const mail = await waitForMailTo(app, session.email, sent);
    expect(mail.text).not.toContain('SMS');
  });

  it('şifre değiştirilince diğer oturumların erişim belirteci hemen geçersiz olur, bu oturum devam eder', async () => {
    const session = await registerAndLogin(app);
    const other = await login(app, session.email);
    const changed = await request(server)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ currentPassword: PASSWORD, newPassword: 'YeniSifre4567' })
      .expect(200);
    await request(server).get('/api/v1/auth/me').set('Authorization', `Bearer ${other.accessToken}`).expect(401);
    await request(server).get('/api/v1/auth/me').set('Authorization', `Bearer ${changed.body.accessToken}`).expect(200);
  });

  it('pasif yapılan hesabın açık oturumu hemen kapanır', async () => {
    const session = await registerAndLogin(app);
    await db.update(users).set({ isActive: false }).where(eq(users.id, session.user.id));
    await request(server).get('/api/v1/auth/me').set('Authorization', `Bearer ${session.accessToken}`).expect(401);
  });

  it('lisans süresi dolan kuruluş yalnızca okuma kipindedir; yönetici lisansı yeniler', async () => {
    const owner = await registerAndLogin(app);
    const orgId = await createOrg(app, owner, { name: 'Lisans Deneme A.Ş.' });
    const as = (req: request.Test) => req.set('Authorization', `Bearer ${owner.accessToken}`).set('X-Organization-Id', orgId);
    await db.update(organizations).set({ licenseExpiresAt: new Date(Date.now() - 60_000) }).where(eq(organizations.id, orgId));

    await as(request(server).get('/api/v1/organizations/current')).expect(200);
    const blocked = await as(request(server).patch('/api/v1/organizations/current')).send({ phone: '02120000000' }).expect(403);
    expect(blocked.body.message).toContain('Lisans süreniz doldu');
    // Bildirimi okundu yapmak ve destek talebi açmak (yenileme için) çalışır.
    await as(request(server).post('/api/v1/notifications/read-all')).expect(204);
    await as(request(server).post('/api/v1/support/tickets'))
      .field('subject', 'Lisans yenileme')
      .field('category', 'account')
      .field('body', 'Lisansımızı yenilemek istiyoruz.')
      .expect(201);

    const admin = await registerAndLogin(app);
    await makePlatformAdmin(app, admin.user.id);
    const patch = (body: object) =>
      request(server).patch(`/api/v1/admin/organizations/${orgId}/license`).set('Authorization', `Bearer ${admin.accessToken}`).send(body);
    await request(server)
      .patch(`/api/v1/admin/organizations/${orgId}/license`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ status: 'active', expiresAt: null })
      .expect(403);
    await patch({ status: 'trial', expiresAt: null }).expect(400);
    const renewed = await patch({ status: 'active', expiresAt: '2099-12-31' }).expect(200);
    expect(renewed.body.licenseStatus).toBe('active');
    expect(new Date(renewed.body.licenseExpiresAt).toISOString()).toBe('2099-12-31T20:59:59.000Z');
    await as(request(server).patch('/api/v1/organizations/current')).send({ phone: '02120000000' }).expect(200);

    await patch({ status: 'expired', expiresAt: null }).expect(200);
    await as(request(server).patch('/api/v1/organizations/current')).send({ phone: '02120000001' }).expect(403);
  });
});
