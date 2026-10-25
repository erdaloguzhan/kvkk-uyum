import { INestApplication } from '@nestjs/common';
import { createHash } from 'node:crypto';
import request from 'supertest';
import { CaptchaChallenge, CaptchaService } from '../src/auth/captcha.service';
import { createApp, createUser, PASSWORD, uniqueEmail } from './helpers';

/** Tarayıcının yaptığını yapar: sha256(salt + n) = challenge olan n'i bulur. */
function solve(c: CaptchaChallenge) {
  for (let n = 0; n <= c.maxnumber; n++) {
    if (createHash('sha256').update(c.salt + n).digest('hex') === c.challenge) {
      return Buffer.from(JSON.stringify({ algorithm: c.algorithm, challenge: c.challenge, number: n, salt: c.salt, signature: c.signature })).toString('base64');
    }
  }
  throw new Error('çözülemedi');
}

describe('Bot koruması (iş kanıtı)', () => {
  let app: INestApplication;
  let server: any;
  const challenge = async () => (await request(server).get('/api/v1/auth/captcha').expect(200)).body as CaptchaChallenge;

  beforeAll(async () => {
    app = await createApp();
    server = app.getHttpServer();
    app.get(CaptchaService).enabled = true;
  });
  afterAll(() => app.close());

  it('çözümsüz veya hatalı çözümle giriş ve şifre sıfırlama reddedilir', async () => {
    const email = uniqueEmail();
    await createUser(app, email);
    await request(server).post('/api/v1/auth/login').send({ email, password: PASSWORD }).expect(400);
    await request(server).post('/api/v1/auth/password-reset/request').send({ email }).expect(400);
    await request(server).post('/api/v1/training-portal/login').send({ phone: '05321234567', password: PASSWORD }).expect(400);

    const c = await challenge();
    const wrong = Buffer.from(JSON.stringify({ ...c, number: -1 })).toString('base64');
    await request(server).post('/api/v1/auth/login').send({ email, password: PASSWORD, captchaToken: wrong }).expect(400);
    await request(server).post('/api/v1/auth/login').send({ email, password: PASSWORD, captchaToken: 'bozuk' }).expect(400);
    // Başka bir sorunun imzasıyla
    const other = await challenge();
    const forged = JSON.parse(Buffer.from(solve(c), 'base64').toString());
    forged.signature = other.signature;
    await request(server)
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD, captchaToken: Buffer.from(JSON.stringify(forged)).toString('base64') })
      .expect(400);
  });

  it('doğru çözümle giriş yapılır, aynı çözüm ikinci kez kullanılamaz', async () => {
    const email = uniqueEmail();
    await createUser(app, email);
    const token = solve(await challenge());
    await request(server).post('/api/v1/auth/login').send({ email, password: PASSWORD, captchaToken: token }).expect(200);
    await request(server).post('/api/v1/auth/login').send({ email, password: PASSWORD, captchaToken: token }).expect(400);
    const reset = solve(await challenge());
    await request(server).post('/api/v1/auth/password-reset/request').send({ email, captchaToken: reset }).expect(202);
  });

  it('süresi geçen soru reddedilir', async () => {
    const captcha = app.get(CaptchaService);
    const old = captcha.createChallenge(Date.now() - 6 * 60 * 1000);
    await expect(captcha.verify(solve(old))).rejects.toThrow();
  });
});
