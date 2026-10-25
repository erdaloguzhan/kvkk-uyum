import { INestApplication } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { eq, sql } from 'drizzle-orm';
import request from 'supertest';
import { Database, DB } from '../src/db/db.module';
import { trainingParticipants } from '../src/db/schema';
import { isValidNationalId } from '../src/training/national-id';
import { normalizeMobile } from '../src/training/phone';
import { createApp, createOrg, extractCode, lastMailTo, login, makePlatformAdmin, PASSWORD, registerAndLogin, mailCount, uniqueEmail, waitForMailTo } from './helpers';

/** Rastgele geçerli T.C. kimlik no. */
function nationalId() {
  const d = [1 + Math.floor(Math.random() * 9), ...Array.from({ length: 8 }, () => Math.floor(Math.random() * 10))];
  const odd = d[0] + d[2] + d[4] + d[6] + d[8];
  const even = d[1] + d[3] + d[5] + d[7];
  d.push((((odd * 7 - even) % 10) + 10) % 10);
  d.push(d.reduce((a, b) => a + b, 0) % 10);
  return d.join('');
}

function binary(res: any, cb: (err: Error | null, body: Buffer) => void) {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
}

const question = (testType: 'pre' | 'post', points: number, correctOption = 'B') => ({
  testType,
  text: '6698 sayılı kanun hangi yılda yayımlanmıştır?',
  optionA: '2001',
  optionB: '2016',
  optionC: '2012',
  optionD: '1996',
  correctOption,
  points,
});

/** Tüm soruları doğru (veya yanlış) cevaplar. */
const answersFor = (questions: { id: string }[], correct: boolean) =>
  Object.fromEntries(questions.map((q) => [q.id, correct ? 'B' : 'A']));

let phoneSeq = 100000000 + Math.floor(Math.random() * 800000000);
/** Her çağrıda farklı bir cep telefonu (05XXXXXXXXX). */
const uniquePhone = () => `05${phoneSeq++}`;

describe('Uzaktan eğitim', () => {
  let app: INestApplication;
  let server: any;
  let db: Database;
  let admin: { email: string; accessToken: string; user: { id: string } };
  let orgId: string;

  const asAdmin = (req: request.Test) => req.set('authorization', `Bearer ${admin.accessToken}`);

  beforeAll(async () => {
    app = await createApp();
    server = app.getHttpServer();
    db = app.get<Database>(DB);
    admin = await registerAndLogin(app, uniqueEmail('egitim-admin'));
    await makePlatformAdmin(app, admin.user.id);
    const owner = await registerAndLogin(app);
    orgId = await createOrg(app, owner, { name: 'Eğitim Müşteri A.Ş.' });
  });

  afterAll(() => app.close());

  it('T.C. kimlik no kontrol hanelerini denetler', () => {
    expect(isValidNationalId('10000000146')).toBe(true);
    expect(isValidNationalId('10000000147')).toBe(false);
    expect(isValidNationalId('01234567890')).toBe(false);
    expect(isValidNationalId(nationalId())).toBe(true);
  });

  it('cep telefonunu boşluklu/ön ekli yazımlarda tek biçime getirir', async () => {
    for (const v of ['0532 123 45 67', '0532-123-45-67', '(0532) 123 45 67', '+90 532 123 45 67', '905321234567', '5321234567']) {
      expect(normalizeMobile(v)).toBe('05321234567');
    }
    expect(normalizeMobile('0312 000 00 00')).toBeNull();
    expect(normalizeMobile('0532 123 45')).toBeNull();
    const phoneOrg = await createOrg(app, await registerAndLogin(app), { name: 'Telefon Deneme A.Ş.' });
    const res = await asAdmin(request(server).post(`/api/v1/admin/organizations/${phoneOrg}/employees`))
      .send({ nationalId: nationalId(), firstName: 'Boşluk', lastName: 'Deneme', phone: ' 0532 123 45 67 ' })
      .expect(201);
    expect(res.body.phone).toBe('05321234567');
    const bad = await asAdmin(request(server).post(`/api/v1/admin/organizations/${phoneOrg}/employees`))
      .send({ nationalId: nationalId(), firstName: 'Hatalı', lastName: 'Telefon', phone: '0532 12' })
      .expect(400);
    expect(JSON.stringify(bad.body)).toContain('Cep telefonunu');

    // Telefon portal kullanıcı adıdır: başka kişide kullanılamaz, aynı kişi başka kuruluşta aynı telefonla kayıtlı olabilir.
    const tc = (await asAdmin(request(server).get(`/api/v1/admin/organizations/${phoneOrg}/employees`)).expect(200)).body.items[0].nationalId;
    const taken = await asAdmin(request(server).post(`/api/v1/admin/organizations/${phoneOrg}/employees`))
      .send({ nationalId: nationalId(), firstName: 'Başka', lastName: 'Kişi', phone: '05321234567' })
      .expect(409);
    expect(taken.body.message).toContain('başka bir kişinin');
    const secondOrg = await createOrg(app, await registerAndLogin(app), { name: 'Telefon Deneme 2 A.Ş.' });
    await asAdmin(request(server).post(`/api/v1/admin/organizations/${secondOrg}/employees`))
      .send({ nationalId: tc, firstName: 'Boşluk', lastName: 'Deneme', phone: '05321234567' })
      .expect(201);
  });

  it('T.C. kimlik noyu veritabanında şifreli saklar, API düz metin döner', async () => {
    const tc = nationalId();
    const otherOrg = await createOrg(app, await registerAndLogin(app), { name: 'Şifreleme Deneme A.Ş.' });
    const res = await asAdmin(request(server).post(`/api/v1/admin/organizations/${otherOrg}/employees`))
      .send({ nationalId: tc, firstName: 'Gizli', lastName: 'Kişi' })
      .expect(201);
    expect(res.body.nationalId).toBe(tc);
    const { rows } = await db.execute<{ national_id: string; national_id_hash: string }>(
      sql`select national_id, national_id_hash from employees where id = ${res.body.id}`,
    );
    expect(rows[0].national_id).toMatch(/^enc:v1:/);
    expect(rows[0].national_id).not.toContain(tc);
    expect(rows[0].national_id_hash).toHaveLength(64);
    const list = await asAdmin(request(server).get(`/api/v1/admin/organizations/${otherOrg}/employees`)).expect(200);
    expect(list.body.items[0].nationalId).toBe(tc);
  });

  it('çalışanları ekler, Excel ile içe aktarır ve hatalı dosyada hiçbir kaydı değiştirmez', async () => {
    const tc = nationalId();
    await asAdmin(request(server).post(`/api/v1/admin/organizations/${orgId}/employees`))
      .send({ nationalId: tc, firstName: 'Ayşe', lastName: 'Yılmaz', email: uniqueEmail('ayse') })
      .expect(201);
    await asAdmin(request(server).post(`/api/v1/admin/organizations/${orgId}/employees`))
      .send({ nationalId: tc, firstName: 'Başka', lastName: 'Kişi' })
      .expect(409);
    await asAdmin(request(server).post(`/api/v1/admin/organizations/${orgId}/employees`))
      .send({ nationalId: '12345678901', firstName: 'X', lastName: 'Y' })
      .expect(400);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Çalışanlar');
    sheet.addRow(['T.C. Kimlik No', 'Adı', 'Soyadı', 'İşe Giriş Tarihi', 'E-posta']);
    sheet.addRow([tc, 'Ayşe', 'Yılmaz-Kaya', '15.03.2020', '']);
    sheet.addRow([nationalId(), 'Mehmet', 'Öz', new Date(Date.UTC(2021, 0, 4)), uniqueEmail('mehmet')]);
    const good = Buffer.from(await workbook.xlsx.writeBuffer());
    sheet.addRow(['123', 'Hatalı', 'Satır']);
    const bad = Buffer.from(await workbook.xlsx.writeBuffer());

    const rejected = await asAdmin(request(server).post(`/api/v1/admin/organizations/${orgId}/employees/import`))
      .attach('file', bad, 'calisanlar.xlsx')
      .expect(400);
    expect(rejected.body.errors).toEqual([expect.objectContaining({ row: 4, column: 'T.C. Kimlik No' })]);

    const imported = await asAdmin(request(server).post(`/api/v1/admin/organizations/${orgId}/employees/import`))
      .attach('file', good, 'calisanlar.xlsx')
      .expect(200);
    expect(imported.body).toMatchObject({ created: 1, updated: 1 });
    const list = await asAdmin(request(server).get(`/api/v1/admin/organizations/${orgId}/employees`)).expect(200);
    expect(list.body.items.map((e: any) => e.lastName)).toEqual(['Yılmaz-Kaya', 'Öz']);
    expect(list.body.items.find((e: any) => e.firstName === 'Mehmet').hireDate).toBe('2021-01-04');
  });

  it('eğitimci ekler; eğitimci eğitim bölümüne girer ama eğitimci ekleyemez ve kuruluşları yönetemez', async () => {
    const email = uniqueEmail('egitimci');
    const created = await asAdmin(request(server).post('/api/v1/training-admin/trainers'))
      .send({ nationalId: nationalId(), firstName: 'Zeynep', lastName: 'Şahin', email })
      .expect(201);
    expect(created.body).toMatchObject({ email, isActive: true });

    const code = extractCode(lastMailTo(app, email).text);
    await request(server).post('/api/v1/auth/password-reset/confirm').send({ token: code, password: PASSWORD }).expect(204);
    const trainer = await login(app, email);
    const auth = (req: request.Test) => req.set('authorization', `Bearer ${trainer.accessToken}`);

    const me = await auth(request(server).get('/api/v1/auth/me')).expect(200);
    expect(me.body).toMatchObject({ isTrainer: true, isPlatformAdmin: false });
    await auth(request(server).get('/api/v1/training-admin/trainings')).expect(200);
    await auth(request(server).post('/api/v1/training-admin/trainers'))
      .send({ nationalId: nationalId(), firstName: 'A', lastName: 'B', email: uniqueEmail() })
      .expect(403);
    await auth(request(server).get('/api/v1/admin/organizations')).expect(403);

    await asAdmin(request(server).patch(`/api/v1/training-admin/trainers/${created.body.id}`)).send({ isActive: false }).expect(200);
    await auth(request(server).get('/api/v1/training-admin/trainings')).expect(403);

    // Platform yöneticisi e-postayı (kullanıcı adı) ve bilgileri değiştirir, sonra eğitimciyi siler.
    const newEmail = uniqueEmail('egitimci-yeni');
    const edited = await asAdmin(request(server).patch(`/api/v1/training-admin/trainers/${created.body.id}`))
      .send({ email: newEmail, phone: '0555 111 22 33', hireDate: null })
      .expect(200);
    expect(edited.body).toMatchObject({ email: newEmail, phone: '05551112233' });
    await asAdmin(request(server).patch(`/api/v1/training-admin/trainers/${created.body.id}`))
      .send({ email: admin.email })
      .expect(409);
    await auth(request(server).delete(`/api/v1/training-admin/trainers/${created.body.id}`)).expect(403);
    await asAdmin(request(server).delete(`/api/v1/training-admin/trainers/${created.body.id}`)).expect(204);
    const after = await asAdmin(request(server).get('/api/v1/training-admin/trainers')).expect(200);
    expect(after.body.items.find((t: any) => t.id === created.body.id)).toBeUndefined();
    await request(server).post('/api/v1/auth/login').send({ email: newEmail, password: PASSWORD }).expect(401);

    const outsider = await registerAndLogin(app);
    await request(server).get('/api/v1/training-admin/trainings').set('authorization', `Bearer ${outsider.accessToken}`).expect(403);
  });

  describe('eğitim akışı', () => {
    let trainingId: string;
    let groupId: string;
    let employeeEmail: string;
    let employeePhone: string;
    let participantId: string;
    let portalToken: string;

    const portal = (req: request.Test, token = portalToken) => req.set('authorization', `Bearer ${token}`);
    const expireTopicTimer = () =>
      db
        .update(trainingParticipants)
        .set({ topicStartedAt: new Date(Date.now() - 3600_000) })
        .where(eq(trainingParticipants.id, participantId));

    it('eğitimi hazırlar; puan toplamı 100 olmadan yayına alınmaz', async () => {
      const t = await asAdmin(request(server).post('/api/v1/training-admin/trainings'))
        .send({ name: 'KVKK Farkındalık Eğitimi' })
        .expect(201);
      trainingId = t.body.id;
      expect(t.body).toMatchObject({ status: 'draft', passScore: 70 });

      const topic1 = await asAdmin(request(server).post(`/api/v1/training-admin/trainings/${trainingId}/topics`))
        .send({ title: 'Mevzuat', content: '# Mevzuat\n\n**6698** sayılı kanun.', minReadSeconds: 60 })
        .expect(201);
      const topic2 = await asAdmin(request(server).post(`/api/v1/training-admin/trainings/${trainingId}/topics`))
        .send({ title: 'Temel kavramlar', content: 'Kişisel veri nedir?', minReadSeconds: 30 })
        .expect(201);
      const reordered = await asAdmin(request(server).post(`/api/v1/training-admin/trainings/${trainingId}/topics/reorder`))
        .send({ ids: [topic2.body.id, topic1.body.id] })
        .expect(200);
      expect(reordered.body.map((x: any) => x.title)).toEqual(['Temel kavramlar', 'Mevzuat']);
      await asAdmin(request(server).post(`/api/v1/training-admin/trainings/${trainingId}/topics/reorder`))
        .send({ ids: [topic1.body.id, topic2.body.id] })
        .expect(200);

      for (const type of ['pre', 'post'] as const) {
        await asAdmin(request(server).post(`/api/v1/training-admin/trainings/${trainingId}/questions`))
          .send(question(type, 60))
          .expect(201);
      }
      const blocked = await asAdmin(request(server).patch(`/api/v1/training-admin/trainings/${trainingId}`))
        .send({ status: 'active' })
        .expect(400);
      expect(blocked.body.message).toContain('ön test soru puanları toplamı 60');
      await asAdmin(request(server).post(`/api/v1/training-admin/trainings/${trainingId}/questions`))
        .send(question('pre', 50))
        .expect(400);
      for (const type of ['pre', 'post'] as const) {
        await asAdmin(request(server).post(`/api/v1/training-admin/trainings/${trainingId}/questions`))
          .send(question(type, 40))
          .expect(201);
      }
      const active = await asAdmin(request(server).patch(`/api/v1/training-admin/trainings/${trainingId}`))
        .send({ status: 'active' })
        .expect(200);
      expect(active.body).toMatchObject({ status: 'active', totals: { pre: 100, post: 100 }, problems: [] });
    });

    it('grubu oluşturur, eğitimi başlatır ve katılımcıya giriş bilgileri gönderir', async () => {
      employeeEmail = uniqueEmail('katilimci');
      employeePhone = uniquePhone();
      const emp = await asAdmin(request(server).post(`/api/v1/admin/organizations/${orgId}/employees`))
        .send({ nationalId: nationalId(), firstName: 'Can', lastName: 'Ürün', email: employeeEmail, phone: employeePhone })
        .expect(201);
      const noPhone = await asAdmin(request(server).post(`/api/v1/admin/organizations/${orgId}/employees`))
        .send({ nationalId: nationalId(), firstName: 'Telefonsuz', lastName: 'Çalışan', email: uniqueEmail('telefonsuz') })
        .expect(201);
      const noEmail = await asAdmin(request(server).post(`/api/v1/admin/organizations/${orgId}/employees`))
        .send({ nationalId: nationalId(), firstName: 'E-postasız', lastName: 'Çalışan' })
        .expect(201);

      // Eğitimci grupta seçilir (zorunlu); sertifikada grubun eğitimcisi yazar.
      const groupTrainer = await asAdmin(request(server).post('/api/v1/training-admin/trainers'))
        .send({ nationalId: nationalId(), firstName: 'Grup', lastName: 'Eğitimcisi', email: uniqueEmail('grup-egitimci') })
        .expect(201);
      const body = { organizationId: orgId, trainingId, name: 'Eğitim Müşteri çalışanları', employeeIds: [emp.body.id, noEmail.body.id, noPhone.body.id] };
      await asAdmin(request(server).post('/api/v1/training-admin/groups')).send(body).expect(400);
      const group = await asAdmin(request(server).post('/api/v1/training-admin/groups'))
        .send({ ...body, trainerId: groupTrainer.body.id })
        .expect(201);
      expect(group.body).toMatchObject({ trainerId: groupTrainer.body.id, trainerName: 'Grup Eğitimcisi' });
      groupId = group.body.id;
      participantId = group.body.participants.find((p: any) => p.email === employeeEmail).id;

      const sent = await asAdmin(request(server).post(`/api/v1/training-admin/groups/${groupId}/send`)).send({}).expect(200);
      expect(sent.body).toEqual({
        sent: 1,
        skipped: expect.arrayContaining([
          { name: 'E-postasız Çalışan', reason: 'E-posta adresi yok' },
          { name: 'Telefonsuz Çalışan', reason: 'Cep telefonu yok (portal kullanıcı adı)' },
        ]),
      });
      const mail = lastMailTo(app, employeeEmail).text;
      expect(mail).toContain('/egitim');
      expect(mail).toContain(`Kullanıcı adınız (cep telefonunuz): ${employeePhone}`);
      const tempPassword = /Geçici şifreniz: (\S+)/.exec(mail)![1];

      const loginRes = await request(server)
        .post('/api/v1/training-portal/login')
        .send({ phone: employeePhone.replace(/^0(\d{3})(\d{3})(\d{2})(\d{2})$/, '0$1 $2 $3 $4'), password: tempPassword })
        .expect(200);
      expect(loginRes.body.account.mustChangePassword).toBe(true);
      const pending = await portal(request(server).get('/api/v1/training-portal/assignments'), loginRes.body.token).expect(403);
      expect(pending.body.code).toBe('PASSWORD_CHANGE_REQUIRED');

      const changed = await portal(request(server).post('/api/v1/training-portal/change-password'), loginRes.body.token)
        .send({ currentPassword: tempPassword, newPassword: PASSWORD })
        .expect(200);
      portalToken = changed.body.token;
      const list = await portal(request(server).get('/api/v1/training-portal/assignments')).expect(200);
      expect(list.body.items).toEqual([expect.objectContaining({ id: participantId, trainingName: 'KVKK Farkındalık Eğitimi' })]);

      // Yönetim belirteci portalda, portal belirteci yönetimde geçmez.
      await request(server).get('/api/v1/training-portal/assignments').set('authorization', `Bearer ${admin.accessToken}`).expect(401);
      await request(server).get('/api/v1/auth/me').set('authorization', `Bearer ${portalToken}`).expect(401);
    });

    it('ön test → okuma süreli konular → son test; çıkıp girince eğitim baştan başlar', async () => {
      const start = await portal(request(server).get(`/api/v1/training-portal/assignments/${participantId}`)).expect(200);
      expect(start.body.step).toBe('pretest');
      expect(start.body.questions).toHaveLength(2);
      expect(start.body.questions[0]).not.toHaveProperty('correctOption');

      await portal(request(server).post(`/api/v1/training-portal/assignments/${participantId}/pretest`))
        .send({ answers: { [start.body.questions[0].id]: 'B' } })
        .expect(400);
      const pre = await portal(request(server).post(`/api/v1/training-portal/assignments/${participantId}/pretest`))
        .send({ answers: answersFor(start.body.questions, false) })
        .expect(200);
      expect(pre.body).toMatchObject({ score: 0, passed: null, step: 'topic', topic: { index: 0, title: 'Mevzuat' } });
      await portal(request(server).post(`/api/v1/training-portal/assignments/${participantId}/pretest`))
        .send({ answers: answersFor(start.body.questions, true) })
        .expect(409);

      const early = await portal(request(server).post(`/api/v1/training-portal/assignments/${participantId}/next`))
        .send({ topicIndex: 0 })
        .expect(400);
      expect(early.body.message).toMatch(/saniye daha/);
      await expireTopicTimer();
      const second = await portal(request(server).post(`/api/v1/training-portal/assignments/${participantId}/next`))
        .send({ topicIndex: 0 })
        .expect(200);
      expect(second.body.topic).toMatchObject({ index: 1, title: 'Temel kavramlar' });

      // Yeni oturum (çıkış + yeniden giriş): konular baştan başlar, ön test tekrar sorulmaz.
      const relogin = await request(server).post('/api/v1/training-portal/login').send({ phone: employeePhone, password: PASSWORD }).expect(200);
      portalToken = relogin.body.token;
      const restarted = await portal(request(server).get(`/api/v1/training-portal/assignments/${participantId}`)).expect(200);
      expect(restarted.body).toMatchObject({ step: 'topic', topic: { index: 0 } });

      for (const index of [0, 1]) {
        await expireTopicTimer();
        await portal(request(server).post(`/api/v1/training-portal/assignments/${participantId}/next`)).send({ topicIndex: index }).expect(200);
      }
      const post = await portal(request(server).get(`/api/v1/training-portal/assignments/${participantId}`)).expect(200);
      expect(post.body.step).toBe('posttest');

      const failed = await portal(request(server).post(`/api/v1/training-portal/assignments/${participantId}/posttest`))
        .send({ answers: { ...answersFor(post.body.questions, true), [post.body.questions[0].id]: 'A' } })
        .expect(200);
      expect(failed.body).toMatchObject({ score: 40, passed: false, step: 'topic', topic: { index: 0 } });

      for (const index of [0, 1]) {
        await expireTopicTimer();
        await portal(request(server).post(`/api/v1/training-portal/assignments/${participantId}/next`)).send({ topicIndex: index }).expect(200);
      }
      const passed = await portal(request(server).post(`/api/v1/training-portal/assignments/${participantId}/posttest`))
        .send({ answers: answersFor(post.body.questions, true) })
        .expect(200);
      expect(passed.body).toMatchObject({ score: 100, passed: true, step: 'completed' });
    });

    it('sonuçları listeler, sertifikayı PDF olarak üretir ve cevaplanmış soruları kilitler', async () => {
      const results = await asAdmin(request(server).get('/api/v1/training-admin/results').query({ groupId })).expect(200);
      const row = results.body.items.find((r: any) => r.id === participantId);
      expect(row).toMatchObject({ fullName: 'Can Ürün', preTestScore: 0, postTestScore: 100, postTestAttempts: 2, passed: true });
      expect(row.startedAt).toBeTruthy();
      expect(row.completedAt).toBeTruthy();

      const pdf = await asAdmin(request(server).get(`/api/v1/training-admin/participants/${participantId}/certificate`))
        .buffer(true)
        .parse(binary)
        .expect(200);
      expect(pdf.headers['content-type']).toContain('application/pdf');
      expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');

      const other = results.body.items.find((r: any) => r.id !== participantId);
      await asAdmin(request(server).get(`/api/v1/training-admin/participants/${other.id}/certificate`)).expect(400);

      const training = await asAdmin(request(server).get(`/api/v1/training-admin/trainings/${trainingId}`)).expect(200);
      expect(training.body.questionsLocked).toBe(true);
      await asAdmin(request(server).patch(`/api/v1/training-admin/questions/${training.body.questions[0].id}`))
        .send({ correctOption: 'C' })
        .expect(409);
      await asAdmin(request(server).delete(`/api/v1/training-admin/trainings/${trainingId}`)).expect(409);
      await asAdmin(request(server).delete(`/api/v1/training-admin/groups/${groupId}`)).expect(409);
    });

    it('eğitim kaydı olan çalışan silinemez; şifremi unuttum çalışır', async () => {
      const list = await asAdmin(request(server).get(`/api/v1/admin/organizations/${orgId}/employees`)).expect(200);
      const can = list.body.items.find((e: any) => e.email === employeeEmail);
      await asAdmin(request(server).delete(`/api/v1/admin/organizations/${orgId}/employees/${can.id}`)).expect(409);

      const sent = mailCount(app);
      await request(server).post('/api/v1/training-portal/password-reset/request').send({ phone: employeePhone }).expect(202);
      const token = extractCode((await waitForMailTo(app, employeeEmail, sent)).text);
      await request(server).post('/api/v1/training-portal/password-reset/confirm').send({ token, password: 'YeniSifre12345' }).expect(204);
      await request(server).post('/api/v1/training-portal/login').send({ phone: employeePhone, password: PASSWORD }).expect(401);
      await request(server).post('/api/v1/training-portal/login').send({ phone: employeePhone, password: 'YeniSifre12345' }).expect(200);
    });

    it('gönderilmiş katılımcının kaydı sınav sonuçlarıyla silinemez', async () => {
      await asAdmin(request(server).delete(`/api/v1/training-admin/participants/${participantId}`)).expect(404);
      const results = await asAdmin(request(server).get('/api/v1/training-admin/results').query({ groupId })).expect(200);
      expect(results.body.items.find((r: any) => r.id === participantId)).toBeDefined();
    });
  });

  it('tabloyu Excel dosyasına aktarır ve formül gibi başlayan metni düz metin yazar', async () => {
    const res = await asAdmin(request(server).post('/api/v1/export/xlsx'))
      .send({ fileName: 'Sonuçlar', columns: [{ key: 'a', label: 'Ad' }], rows: [{ a: 'Çağrı' }, { a: '=HYPERLINK("x")' }] })
      .buffer(true)
      .parse(binary)
      .expect(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    expect(ws.getCell('A2').value).toBe('Çağrı');
    expect(ws.getCell('A3').value).toBe(`'=HYPERLINK("x")`);
  });
  it('çalışan yayınlanmış ve çalışanlara açık dokümanları portal hesabıyla görür; işten çıkan göremez', async () => {
    const owner = await registerAndLogin(app);
    const docOrg = await createOrg(app, owner, {
      name: 'Doküman Müşteri A.Ş.',
      address: 'Atatürk Cad. No:1 Ankara',
      email: 'info@ornek.com.tr',
      phone: '+90 312 000 00 00',
      authorizedPerson: 'Ayşe Yılmaz',
      taxNumber: '1234567890',
    });
    const as = (req: request.Test) => req.set({ authorization: `Bearer ${owner.accessToken}`, 'x-organization-id': docOrg });
    const create = async (templateCode: string) =>
      (await as(request(server).post('/api/v1/documents')).send({ templateCode }).expect(201)).body;
    const published = await create('PRS-010');
    const hidden = await create('PRS-020');
    const draft = await create('AYM-010');
    for (const d of [published, hidden]) {
      await as(request(server).post(`/api/v1/documents/${d.id}/versions/${d.versions[0].id}/publish`)).expect(200);
    }
    const toggled = await as(request(server).patch(`/api/v1/documents/${hidden.id}`)).send({ employeeVisible: false }).expect(200);
    expect(toggled.body.employeeVisible).toBe(false);

    const email = uniqueEmail('calisan');
    const phone = uniquePhone();
    const emp = await asAdmin(request(server).post(`/api/v1/admin/organizations/${docOrg}/employees`))
      .send({ nationalId: nationalId(), firstName: 'Can', lastName: 'Er', email, phone })
      .expect(201);
    const noEmail = await asAdmin(request(server).post(`/api/v1/admin/organizations/${docOrg}/employees`))
      .send({ nationalId: nationalId(), firstName: 'E-postasız', lastName: 'Çalışan' })
      .expect(201);
    const access = await asAdmin(request(server).post(`/api/v1/admin/organizations/${docOrg}/employees/portal-access`))
      .send({ employeeIds: [emp.body.id, noEmail.body.id] })
      .expect(200);
    expect(access.body).toEqual({ sent: 1, skipped: [{ name: 'E-postasız Çalışan', reason: 'E-posta adresi yok' }] });
    // Müşteri ve platform yöneticisi olmayanlar portal erişimi gönderemez.
    await request(server)
      .post(`/api/v1/admin/organizations/${docOrg}/employees/portal-access`)
      .set('authorization', `Bearer ${owner.accessToken}`)
      .send({})
      .expect(403);

    const mail = lastMailTo(app, email).text;
    expect(mail).toContain('Doküman Müşteri A.Ş.');
    const temp = /Geçici şifreniz: (\S+)/.exec(mail)![1];
    const first = await request(server).post('/api/v1/training-portal/login').send({ phone, password: temp }).expect(200);
    const changed = await request(server)
      .post('/api/v1/training-portal/change-password')
      .set('authorization', `Bearer ${first.body.token}`)
      .send({ currentPassword: temp, newPassword: PASSWORD })
      .expect(200);
    const portal = (req: request.Test) => req.set('authorization', `Bearer ${changed.body.token}`);

    const list = await portal(request(server).get('/api/v1/training-portal/documents')).expect(200);
    expect(list.body.items).toEqual([
      expect.objectContaining({ id: published.id, code: 'PRS-010', organizationName: 'Doküman Müşteri A.Ş.', versionNo: 1 }),
    ]);
    const file = await portal(request(server).get(`/api/v1/training-portal/documents/${published.id}/file`))
      .buffer(true)
      .parse(binary)
      .expect(200);
    expect(file.body.subarray(0, 2).toString()).toBe('PK');
    for (const d of [hidden, draft]) {
      await portal(request(server).get(`/api/v1/training-portal/documents/${d.id}/file`)).expect(404);
    }
    // Yönetim belirteci portal dokümanlarında geçmez.
    await request(server).get('/api/v1/training-portal/documents').set('authorization', `Bearer ${owner.accessToken}`).expect(401);

    // İşten çıkan çalışan dokümanları artık göremez.
    await asAdmin(request(server).patch(`/api/v1/admin/organizations/${docOrg}/employees/${emp.body.id}`))
      .send({ terminationDate: '2020-01-01', hireDate: '2019-01-01' })
      .expect(200);
    const after = await portal(request(server).get('/api/v1/training-portal/documents')).expect(200);
    expect(after.body.items).toEqual([]);
    await portal(request(server).get(`/api/v1/training-portal/documents/${published.id}/file`)).expect(404);
  });

  it('çalışan dokümanı portalda sonuna kadar okur ve "Okudum, anladım." onayı okunan sürümle kaydedilir', async () => {
    const owner = await registerAndLogin(app);
    const docOrg = await createOrg(app, owner, {
      name: 'Okuma Müşteri A.Ş.',
      address: 'Atatürk Cad. No:1 Ankara',
      email: 'info@ornek.com.tr',
      phone: '+90 312 000 00 00',
      authorizedPerson: 'Ayşe Yılmaz',
      taxNumber: '1234567890',
    });
    const as = (req: request.Test) => req.set({ authorization: `Bearer ${owner.accessToken}`, 'x-organization-id': docOrg });
    const doc = (await as(request(server).post('/api/v1/documents')).send({ templateCode: 'PRS-010' }).expect(201)).body;
    const v1 = doc.versions[0].id;
    await as(request(server).post(`/api/v1/documents/${doc.id}/versions/${v1}/publish`)).expect(200);

    const email = uniqueEmail('okuyan');
    const phone = uniquePhone();
    const emp = await asAdmin(request(server).post(`/api/v1/admin/organizations/${docOrg}/employees`))
      .send({ nationalId: nationalId(), firstName: 'Can', lastName: 'Okur', email, phone })
      .expect(201);
    const other = await asAdmin(request(server).post(`/api/v1/admin/organizations/${docOrg}/employees`))
      .send({ nationalId: nationalId(), firstName: 'Ece', lastName: 'Henüz', email: uniqueEmail('okumayan') })
      .expect(201);
    await asAdmin(request(server).post(`/api/v1/admin/organizations/${docOrg}/employees/portal-access`))
      .send({ employeeIds: [emp.body.id] })
      .expect(200);
    const temp = /Geçici şifreniz: (\S+)/.exec(lastMailTo(app, email).text)![1];
    const first = await request(server).post('/api/v1/training-portal/login').send({ phone, password: temp }).expect(200);
    const changed = await request(server)
      .post('/api/v1/training-portal/change-password')
      .set('authorization', `Bearer ${first.body.token}`)
      .send({ currentPassword: temp, newPassword: PASSWORD })
      .expect(200);
    const portal = (req: request.Test) => req.set('authorization', `Bearer ${changed.body.token}`);

    // Doküman portalda okunabilir metin olarak gelir.
    const view = await portal(request(server).get(`/api/v1/training-portal/documents/${doc.id}`)).expect(200);
    expect(view.body).toMatchObject({ id: doc.id, code: 'PRS-010', versionId: v1, versionNo: 1, confirmedAt: null });
    expect(view.body.html).toContain('<p>');
    expect(view.body.html).toContain('<h1>AMAÇ</h1>');

    // Bu arada değişen sürüm onaylanamaz; doğru sürümün onayı bir kez kaydedilir.
    await portal(request(server).post(`/api/v1/training-portal/documents/${doc.id}/read`))
      .send({ versionId: other.body.id })
      .expect(409);
    const confirmed = await portal(request(server).post(`/api/v1/training-portal/documents/${doc.id}/read`))
      .send({ versionId: v1 })
      .expect(200);
    expect(confirmed.body.versionNo).toBe(1);
    const again = await portal(request(server).post(`/api/v1/training-portal/documents/${doc.id}/read`))
      .send({ versionId: v1 })
      .expect(200);
    expect(again.body.confirmedAt).toBe(confirmed.body.confirmedAt);
    const list = await portal(request(server).get('/api/v1/training-portal/documents')).expect(200);
    expect(list.body.items).toEqual([expect.objectContaining({ id: doc.id, confirmedAt: confirmed.body.confirmedAt })]);

    // Kuruluş, kimin hangi sürümü ne zaman onayladığını ve kimin henüz onaylamadığını görür.
    let report = await as(request(server).get(`/api/v1/documents/${doc.id}/reads`)).expect(200);
    expect(report.body).toMatchObject({ publishedVersion: { id: v1, versionNo: 1 } });
    expect(report.body.reads).toEqual([
      expect.objectContaining({ versionNo: 1, employee: expect.objectContaining({ id: emp.body.id, lastName: 'Okur' }) }),
    ]);
    expect(report.body.notConfirmed.map((e: any) => e.id)).toEqual([other.body.id]);

    // Yeni sürüm yayınlanınca çalışan yeni sürümü ayrıca onaylar; eski onay kayıtta kalır.
    const regenerated = await as(request(server).post(`/api/v1/documents/${doc.id}/regenerate`)).expect(201);
    const v2 = regenerated.body.id;
    await as(request(server).post(`/api/v1/documents/${doc.id}/versions/${v2}/publish`)).expect(200);
    const relist = await portal(request(server).get('/api/v1/training-portal/documents')).expect(200);
    expect(relist.body.items).toEqual([expect.objectContaining({ versionNo: 2, confirmedAt: null })]);
    await portal(request(server).post(`/api/v1/training-portal/documents/${doc.id}/read`)).send({ versionId: v1 }).expect(409);
    report = await as(request(server).get(`/api/v1/documents/${doc.id}/reads`)).expect(200);
    expect(report.body.notConfirmed.map((e: any) => e.id).sort()).toEqual([emp.body.id, other.body.id].sort());
    await portal(request(server).post(`/api/v1/training-portal/documents/${doc.id}/read`)).send({ versionId: v2 }).expect(200);
    report = await as(request(server).get(`/api/v1/documents/${doc.id}/reads`)).expect(200);
    expect(report.body.reads.map((r: any) => r.versionNo)).toEqual([2, 1]);

    // Başka kuruluşun kullanıcısı okuma kayıtlarını göremez; okuma, onay ve indirme loglanır.
    const stranger = await registerAndLogin(app);
    const strangerOrg = await createOrg(app, stranger, { name: 'Başka Kuruluş A.Ş.' });
    await request(server)
      .get(`/api/v1/documents/${doc.id}/reads`)
      .set({ authorization: `Bearer ${stranger.accessToken}`, 'x-organization-id': strangerOrg })
      .expect(404);
    await as(request(server).get(`/api/v1/documents/${doc.id}/versions/${v2}/file`)).expect(200);
    const logs = await as(request(server).get('/api/v1/audit-logs?module=document')).expect(200);
    const actions = logs.body.items.map((l: any) => l.action);
    expect(actions).toEqual(expect.arrayContaining(['document.portal_viewed', 'document.read_confirmed']));
    expect(logs.body.items.find((l: any) => l.action === 'document.read_confirmed').metadata).toMatchObject({
      employeeId: emp.body.id,
      versionNo: 2,
      account: email,
    });
    const download = await as(request(server).get('/api/v1/audit-logs?action=documents.download')).expect(200);
    expect(download.body.items).toEqual([expect.objectContaining({ entityId: doc.id, user: expect.objectContaining({ email: owner.email }) })]);
  });
});
