import { INestApplication } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { Database, DB } from '../src/db/db.module';
import { trainingParticipants } from '../src/db/schema';
import { isValidNationalId } from '../src/training/national-id';
import { createApp, createOrg, extractCode, lastMailTo, login, makePlatformAdmin, PASSWORD, registerAndLogin, uniqueEmail } from './helpers';

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
      .send({ email: newEmail, phone: '05551112233', hireDate: null })
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
      const emp = await asAdmin(request(server).post(`/api/v1/admin/organizations/${orgId}/employees`))
        .send({ nationalId: nationalId(), firstName: 'Can', lastName: 'Ürün', email: employeeEmail })
        .expect(201);
      const noEmail = await asAdmin(request(server).post(`/api/v1/admin/organizations/${orgId}/employees`))
        .send({ nationalId: nationalId(), firstName: 'E-postasız', lastName: 'Çalışan' })
        .expect(201);

      const group = await asAdmin(request(server).post('/api/v1/training-admin/groups'))
        .send({ organizationId: orgId, trainingId, name: 'Eğitim Müşteri çalışanları', employeeIds: [emp.body.id, noEmail.body.id] })
        .expect(201);
      groupId = group.body.id;
      participantId = group.body.participants.find((p: any) => p.email === employeeEmail).id;

      const sent = await asAdmin(request(server).post(`/api/v1/training-admin/groups/${groupId}/send`)).send({}).expect(200);
      expect(sent.body).toEqual({ sent: 1, skipped: [{ name: 'E-postasız Çalışan', reason: 'E-posta adresi yok' }] });
      const mail = lastMailTo(app, employeeEmail).text;
      expect(mail).toContain('/egitim');
      const tempPassword = /Geçici şifreniz: (\S+)/.exec(mail)![1];

      const loginRes = await request(server)
        .post('/api/v1/training-portal/login')
        .send({ email: employeeEmail, password: tempPassword })
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
      const relogin = await request(server).post('/api/v1/training-portal/login').send({ email: employeeEmail, password: PASSWORD }).expect(200);
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

      await request(server).post('/api/v1/training-portal/password-reset/request').send({ email: employeeEmail }).expect(202);
      const token = extractCode(lastMailTo(app, employeeEmail).text);
      await request(server).post('/api/v1/training-portal/password-reset/confirm').send({ token, password: 'YeniSifre12345' }).expect(204);
      await request(server).post('/api/v1/training-portal/login').send({ email: employeeEmail, password: PASSWORD }).expect(401);
      await request(server).post('/api/v1/training-portal/login').send({ email: employeeEmail, password: 'YeniSifre12345' }).expect(200);
    });

    it('katılımcı kaydını sınav sonuçlarıyla birlikte siler (geçici test özelliği)', async () => {
      await asAdmin(request(server).delete(`/api/v1/training-admin/participants/${participantId}`)).expect(204);
      const results = await asAdmin(request(server).get('/api/v1/training-admin/results').query({ groupId })).expect(200);
      expect(results.body.items.find((r: any) => r.id === participantId)).toBeUndefined();
      const list = await asAdmin(request(server).get(`/api/v1/admin/organizations/${orgId}/employees`)).expect(200);
      const can = list.body.items.find((e: any) => e.email === employeeEmail);
      await asAdmin(request(server).delete(`/api/v1/admin/organizations/${orgId}/employees/${can.id}`)).expect(204);
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
});
