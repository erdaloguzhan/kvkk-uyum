import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  createApp,
  extractCode,
  lastMailTo,
  login,
  PASSWORD,
  registerAndLogin,
  uniqueEmail,
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

  it('zayıf şifreyi ve aynı e-postayla ikinci kaydı reddeder', async () => {
    const email = uniqueEmail();
    await request(server)
      .post('/api/v1/auth/register')
      .send({ email, password: 'kisa', fullName: 'A B' })
      .expect(400);
    await request(server)
      .post('/api/v1/auth/register')
      .send({ email, password: PASSWORD, fullName: 'A B' })
      .expect(201);
    await request(server)
      .post('/api/v1/auth/register')
      .send({ email: email.toUpperCase(), password: PASSWORD, fullName: 'A B' })
      .expect(409);
  });

  it('korumalı uç noktalar belirteç olmadan 401 döner', async () => {
    await request(server).get('/api/v1/auth/me').expect(401);
    await request(server).get('/api/v1/auth/me').set('Authorization', 'Bearer gecersiz').expect(401);
  });

  it('yanlış kodu reddeder, kod tek kullanımlıktır', async () => {
    const email = uniqueEmail();
    await request(server)
      .post('/api/v1/auth/register')
      .send({ email, password: PASSWORD, fullName: 'A B' })
      .expect(201);
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

  it('5 hatalı şifreden sonra hesabı kilitler', async () => {
    const email = uniqueEmail();
    await request(server)
      .post('/api/v1/auth/register')
      .send({ email, password: PASSWORD, fullName: 'A B' })
      .expect(201);
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
    await request(server).post('/api/v1/auth/password-reset/request').send({ email: session.email }).expect(202);
    // Kayıtlı olmayan e-posta için de aynı yanıt.
    await request(server).post('/api/v1/auth/password-reset/request').send({ email: uniqueEmail() }).expect(202);

    const token = extractCode(lastMailTo(app, session.email).text);
    await request(server)
      .post('/api/v1/auth/password-reset/confirm')
      .send({ token, password: 'YeniSifre4567' })
      .expect(204);
    await request(server).post('/api/v1/auth/refresh').send({ refreshToken: session.refreshToken }).expect(401);
    await request(server).post('/api/v1/auth/login').send({ email: session.email, password: PASSWORD }).expect(401);
    await login(app, session.email, 'YeniSifre4567');
  });
});
