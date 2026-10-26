import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  createApp,
  createUser,
  extractCode,
  lastMailTo,
  lastSmsTo,
  login,
  makePlatformAdmin,
  mailCount,
  PASSWORD,
  registerAndLogin,
  uniqueEmail,
  waitForMailTo,
} from './helpers';

describe('Kimlik doğrulama', () => {
  let app: INestApplication;
  let server: any;

  beforeAll(async () => {
    app = await createApp();
    server = app.getHttpServer();
  });
  afterAll(() => app.close());

  it('kayıt, şifre ve e-posta koduyla giriş yapar', async () => {
    const session = await registerAndLogin(app);
    expect(session.accessToken).toBeTruthy();

    const me = await request(server)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);
    expect(me.body.email).toBe(session.email);
    expect(me.body.organizations).toEqual([]);
  });

  it('cep telefonu kayıtlıysa giriş kodu SMS ile gider; telefon kullanıcı veya platform yöneticisi tarafından değiştirilir', async () => {
    const session = await registerAndLogin(app);
    const auth = (req: request.Test) => req.set('Authorization', `Bearer ${session.accessToken}`);
    await auth(request(server).patch('/api/v1/auth/me/phone')).send({ phone: '123' }).expect(400);
    await auth(request(server).patch('/api/v1/auth/me/phone')).send({ phone: '0532 111 22 33' }).expect(200);
    expect(lastMailTo(app, session.email).text).toContain('05321112233');
    const me = await auth(request(server).get('/api/v1/auth/me')).expect(200);
    expect(me.body.phone).toBe('05321112233');

    const step = await request(server).post('/api/v1/auth/login').send({ email: session.email, password: PASSWORD }).expect(200);
    expect(step.body).toMatchObject({ channel: 'sms', destination: '0532 *** ** 33' });
    const code = /(\d{6})/.exec(lastSmsTo(app, '05321112233').text)![1];
    await request(server).post('/api/v1/auth/verify').send({ challengeId: step.body.challengeId, code }).expect(200);

    // Platform yöneticisi başka kullanıcının telefonunu siler: kod yeniden e-postaya gider.
    const admin = await registerAndLogin(app);
    await makePlatformAdmin(app, admin.user.id);
    await auth(request(server).patch(`/api/v1/admin/users/${me.body.id}/phone`)).send({ phone: null }).expect(403);
    await request(server)
      .patch(`/api/v1/admin/users/${me.body.id}/phone`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ phone: null })
      .expect(200);
    const byEmail = await request(server).post('/api/v1/auth/login').send({ email: session.email, password: PASSWORD }).expect(200);
    expect(byEmail.body).toMatchObject({ channel: 'email', destination: null });
  });

  it('açık kayıt yoktur: hesaplar yalnızca yönetim panelinden açılır', async () => {
    await request(server)
      .post('/api/v1/auth/register')
      .send({ email: uniqueEmail(), password: PASSWORD, fullName: 'A B' })
      .expect(404);
  });

  it('korumalı uç noktalar belirteç olmadan 401 döner', async () => {
    await request(server).get('/api/v1/auth/me').expect(401);
    await request(server).get('/api/v1/auth/me').set('Authorization', 'Bearer gecersiz').expect(401);
  });

  it('yanlış kodu reddeder, kod tek kullanımlıktır', async () => {
    const email = uniqueEmail();
    await createUser(app, email);
    const res = await request(server).post('/api/v1/auth/login').send({ email, password: PASSWORD }).expect(200);
    const code = extractCode(lastMailTo(app, email).text);
    const wrong = code === '000000' ? '111111' : '000000';

    await request(server)
      .post('/api/v1/auth/verify')
      .send({ challengeId: res.body.challengeId, code: wrong })
      .expect(401);
    await request(server)
      .post('/api/v1/auth/verify')
      .send({ challengeId: res.body.challengeId, code })
      .expect(200);
    await request(server)
      .post('/api/v1/auth/verify')
      .send({ challengeId: res.body.challengeId, code })
      .expect(401);
  });

  it('yeni giriş kodu istenince önceki kod geçersiz olur', async () => {
    const email = uniqueEmail();
    await createUser(app, email);
    const first = await request(server).post('/api/v1/auth/login').send({ email, password: PASSWORD }).expect(200);
    const firstCode = extractCode(lastMailTo(app, email).text);
    await request(server).post('/api/v1/auth/login').send({ email, password: PASSWORD }).expect(200);
    await request(server)
      .post('/api/v1/auth/verify')
      .send({ challengeId: first.body.challengeId, code: firstCode })
      .expect(401);
  });

  it('5 hatalı şifreden sonra hesabı kilitler', async () => {
    const email = uniqueEmail();
    await createUser(app, email);
    for (let i = 0; i < 5; i++) {
      await request(server).post('/api/v1/auth/login').send({ email, password: 'YanlisSifre99' }).expect(401);
    }
    const res = await request(server).post('/api/v1/auth/login').send({ email, password: PASSWORD }).expect(401);
    expect(res.body.message).toContain('kilitlendi');
  });

  it('yenileme belirteci döner ve eskisi tekrar kullanılamaz', async () => {
    const session = await registerAndLogin(app);
    const r1 = await request(server)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: session.refreshToken })
      .expect(200);
    expect(r1.body.refreshToken).not.toBe(session.refreshToken);
    await request(server).post('/api/v1/auth/refresh').send({ refreshToken: session.refreshToken }).expect(401);

    await request(server)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${r1.body.accessToken}`)
      .send({ refreshToken: r1.body.refreshToken })
      .expect(204);
    await request(server).post('/api/v1/auth/refresh').send({ refreshToken: r1.body.refreshToken }).expect(401);
  });

  it('şifre sıfırlama ile yeni şifre belirlenir', async () => {
    const session = await registerAndLogin(app);
    const sent = mailCount(app);
    await request(server).post('/api/v1/auth/password-reset/request').send({ email: session.email }).expect(202);
    // Kayıtlı olmayan e-posta için de aynı yanıt.
    await request(server).post('/api/v1/auth/password-reset/request').send({ email: uniqueEmail() }).expect(202);

    const token = extractCode((await waitForMailTo(app, session.email, sent)).text);
    await request(server)
      .post('/api/v1/auth/password-reset/confirm')
      .send({ token, password: 'YeniSifre4567' })
      .expect(204);
    await request(server).post('/api/v1/auth/refresh').send({ refreshToken: session.refreshToken }).expect(401);
    await request(server).post('/api/v1/auth/login').send({ email: session.email, password: PASSWORD }).expect(401);
    await login(app, session.email, 'YeniSifre4567');
  });
  it('oturum açmış kullanıcı mevcut şifresiyle şifresini değiştirir', async () => {
    const session = await registerAndLogin(app);
    const other = await login(app, session.email);
    const change = (body: object) =>
      request(server)
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send(body);

    await request(server)
      .post('/api/v1/auth/change-password')
      .send({ currentPassword: PASSWORD, newPassword: 'YeniSifre4567' })
      .expect(401);
    const wrong = await change({ currentPassword: 'YanlisSifre99', newPassword: 'YeniSifre4567' }).expect(400);
    expect(wrong.body.message).toBe('Mevcut şifre hatalı');
    await change({ currentPassword: PASSWORD, newPassword: 'kisa' }).expect(400);
    await change({ currentPassword: PASSWORD, newPassword: PASSWORD }).expect(400);

    const res = await change({ currentPassword: PASSWORD, newPassword: 'YeniSifre4567' }).expect(200);
    expect(res.body.accessToken).toBeTruthy();
    // Önceki tüm oturumlar kapanır, yeni verilen belirteç çalışır.
    await request(server).post('/api/v1/auth/refresh').send({ refreshToken: session.refreshToken }).expect(401);
    await request(server).post('/api/v1/auth/refresh').send({ refreshToken: other.refreshToken }).expect(401);
    await request(server).post('/api/v1/auth/refresh').send({ refreshToken: res.body.refreshToken }).expect(200);
    await request(server).post('/api/v1/auth/login').send({ email: session.email, password: PASSWORD }).expect(401);
    await login(app, session.email, 'YeniSifre4567');
  });

  it('5 hatalı mevcut şifreden sonra hesabı kilitler', async () => {
    const session = await registerAndLogin(app);
    for (let i = 0; i < 5; i++) {
      await request(server)
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({ currentPassword: 'YanlisSifre99', newPassword: 'YeniSifre4567' })
        .expect(400);
    }
    const res = await request(server)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ currentPassword: PASSWORD, newPassword: 'YeniSifre4567' })
      .expect(400);
    expect(res.body.message).toContain('kilitlendi');
  });
});
