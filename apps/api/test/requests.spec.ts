import { INestApplication } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import request from 'supertest';
import { Database, DB } from '../src/db/db.module';
import { dataSubjectRequests, tasks } from '../src/db/schema';
import { NotificationsService } from '../src/workflow/notifications.service';
import { AlarmsService } from '../src/workflow/alarms.service';
import { addDays, dateIn } from '../src/workflow/dates';
import { addMember, createApp, createOrg, lastMailTo, mailCount, registerAndLogin, uniqueEmail } from './helpers';

const PDF = Buffer.from('%PDF-1.4\n%test\n');

const APPLICATION = {
  fullName: 'Ayşe Yılmaz',
  nationalId: '10000000146',
  birthDate: '1985-04-12',
  phone: '0532 111 22 33',
  address: 'Atatürk Cad. No:1 Kadıköy / İstanbul',
  relationship: 'former_employee',
  relationshipDetail: '2019-2023',
  responseMethod: 'email',
  description: 'Eski çalışanınızım; hakkımdaki verileri öğrenmek ve silinmesini istiyorum.',
  items: [
    { no: 1 },
    { no: 6, option: 'a' },
    { no: 5, detail: 'Adresim yanlış kayıtlı' },
  ],
};

describe('İlgili kişi başvuruları', () => {
  let app: INestApplication;
  let server: any;
  let db: Database;

  beforeAll(async () => {
    app = await createApp();
    server = app.getHttpServer();
    db = app.get<Database>(DB);
  });
  afterAll(() => app.close());

  async function setupOrg() {
    const admin = await registerAndLogin(app);
    const orgId = await createOrg(app, admin, { name: 'Örnek Ticaret A.Ş.' });
    const officer = await addMember(app, orgId, 'kvkk_officer', 'Selin Sorumlu');
    const as = (token: string) => ({ Authorization: `Bearer ${token}`, 'X-Organization-Id': orgId });
    const settings = await request(server).get('/api/v1/data-subject-requests/form-settings').set(as(officer.accessToken)).expect(200);
    return { admin, officer, orgId, as, key: settings.body.key as string, settings: settings.body };
  }

  function submit(key: string, fields: Record<string, unknown>, files: { name: string; content: Buffer }[] = []) {
    const req = request(server).post(`/api/v1/request-form/${key}`);
    for (const [k, v] of Object.entries(fields)) {
      if (v === undefined) continue;
      req.field(k, typeof v === 'string' ? v : JSON.stringify(v));
    }
    req.field('consent', 'true');
    for (const f of files) req.attach('files', f.content, f.name);
    return req;
  }

  it('online form başvuruyu alır, Sorumluya görev açar ve alındı e-postası gönderir', async () => {
    const { officer, as, key, settings } = await setupOrg();
    expect(key).toMatch(/^[0-9a-f]{16}$/);
    expect(settings.url).toContain(`/basvuru/${key}`);
    expect(settings.embedCode).toContain('<iframe');

    await request(server)
      .get(`/api/v1/request-form/${key}`)
      .expect(200)
      .expect((r) => expect(r.body.organizationName).toBe('Örnek Ticaret A.Ş.'));
    await request(server).get('/api/v1/request-form/0000000000000000').expect(404);

    const email = uniqueEmail('basvuran');
    const res = await submit(key, { ...APPLICATION, email }, [{ name: 'kimlik.pdf', content: PDF }]).expect(201);
    expect(res.body.number).toBe('B-0001');

    // Alındı e-postasında başvuranın yazdığı metin yer almaz.
    const receipt = lastMailTo(app, email);
    expect(receipt.subject).toContain('B-0001');
    expect(receipt.text).toContain('Örnek Ticaret A.Ş.');
    expect(receipt.text).not.toContain('Ayşe');

    // Görev KVKK Sorumlusuna (Sorumlu + Yönetici olan kurucuya değil) düşer; son tarih 20. gün.
    const list = await request(server).get('/api/v1/data-subject-requests').set(as(officer.accessToken)).expect(200);
    expect(list.body.items).toHaveLength(1);
    const item = list.body.items[0];
    expect(item).toMatchObject({
      code: 'B-0001',
      status: 'new',
      channel: 'web_form',
      phone: '05321112233',
      nationalIdMasked: '100******46',
      assignee: { id: officer.user.id },
    });
    const today = dateIn(new Date());
    expect(item.targetDate).toBe(addDays(today, 20));
    expect(item.legalDueDate).toBe(addDays(today, 30));
    expect(item.items.map((i: any) => i.no)).toEqual([1, 5, 6]);

    const detail = await request(server).get(`/api/v1/data-subject-requests/${item.id}`).set(as(officer.accessToken)).expect(200);
    expect(detail.body.nationalId).toBe('10000000146');
    expect(detail.body.files).toHaveLength(1);
    expect(detail.body.files[0]).toMatchObject({ kind: 'applicant', fileName: 'kimlik.pdf', mimeType: 'application/pdf' });
    expect(detail.body.events[0].kind).toBe('received');
    expect(detail.body.task).toMatchObject({ status: 'open', dueDate: addDays(today, 20), assignee: { id: officer.user.id } });

    // T.C. kimlik numarası veritabanında şifreli.
    const raw = await db.execute<{ national_id: string }>(sql`select national_id from data_subject_requests where id = ${item.id}`);
    expect(raw.rows[0].national_id).toMatch(/^enc:v1:/);

    // Sorumluya bildirim (kişisel veri içermeden).
    const mail = lastMailTo(app, officer.email);
    expect(mail.subject).toBe('Yeni ilgili kişi başvurusu: B-0001');
    expect(mail.text).not.toContain('Ayşe');

    const file = await request(server)
      .get(`/api/v1/data-subject-requests/${item.id}/files/${detail.body.files[0].id}`)
      .set(as(officer.accessToken))
      .expect(200);
    expect(file.headers['content-type']).toContain('application/pdf');

    // İkinci başvuru sıradaki numarayı alır.
    const second = await submit(key, { ...APPLICATION, responseMethod: 'in_person', items: [{ no: 2 }] }).expect(201);
    expect(second.body.number).toBe('B-0002');
  });

  it('eksik veya hatalı form bilgisini reddeder', async () => {
    const { key } = await setupOrg();
    const expectError = async (fields: Record<string, unknown>, path: string) => {
      const res = await submit(key, { ...APPLICATION, email: 'a@ornek.com.tr', ...fields }).expect(400);
      expect(res.body.errors.map((e: any) => e.path)).toContain(path);
    };
    await expectError({ nationalId: '12345678901' }, 'nationalId');
    await expectError({ items: [{ no: 5 }] }, 'items.0.detail');
    await expectError({ items: [{ no: 8 }] }, 'items.0.option');
    await expectError({ items: [] }, 'items');
    await expectError({ email: '' }, 'email');
    await expectError({ responseMethod: 'postal', address: '' }, 'address');
    await expectError({ phone: '' }, 'phone');
    await expectError({ relationship: 'other', relationshipDetail: '' }, 'relationshipDetail');

    const noConsent = request(server).post(`/api/v1/request-form/${key}`);
    for (const [k, v] of Object.entries({ ...APPLICATION, email: 'a@ornek.com.tr' })) {
      noConsent.field(k, typeof v === 'string' ? v : JSON.stringify(v));
    }
    await noConsent.field('consent', 'false').expect(400);

    await submit(key, APPLICATION, [{ name: 'virus.exe', content: Buffer.from('MZ\x90\x00') }]).expect(400);
  });

  it('Sorumlu formu kapatabilir ve adresi yenileyebilir; Yönetici yalnızca görür', async () => {
    const { admin, officer, orgId, as, key } = await setupOrg();
    const yonetici = await addMember(app, orgId, 'approver', 'Zeynep Yönetici');
    const url = '/api/v1/data-subject-requests/form-settings';

    await request(server).patch(url).set(as(yonetici.accessToken)).send({ enabled: false }).expect(403);
    await request(server).get('/api/v1/data-subject-requests').set(as(yonetici.accessToken)).expect(200);

    await request(server).patch(url).set(as(officer.accessToken)).send({ enabled: false }).expect(200);
    await request(server).get(`/api/v1/request-form/${key}`).expect(404);
    await submit(key, { ...APPLICATION, email: 'a@ornek.com.tr' }).expect(404);
    await request(server).patch(url).set(as(admin.accessToken)).send({ enabled: true }).expect(200);
    await request(server).get(`/api/v1/request-form/${key}`).expect(200);

    const renewed = await request(server).post(`${url}/regenerate`).set(as(officer.accessToken)).expect(200);
    expect(renewed.body.key).not.toBe(key);
    await request(server).get(`/api/v1/request-form/${key}`).expect(404);
    await request(server).get(`/api/v1/request-form/${renewed.body.key}`).expect(200);
  });

  it('ek bilgi beklenirken süre durur; cevap kaydı görevi kapatır, PDF ve rapor üretilir', async () => {
    const { officer, orgId, as, key } = await setupOrg();
    const yonetici = await addMember(app, orgId, 'approver', 'Zeynep Yönetici');
    await submit(key, { ...APPLICATION, email: 'b@ornek.com.tr' }).expect(201);
    const [{ id, taskId, targetDate, legalDueDate }] = await db
      .select()
      .from(dataSubjectRequests)
      .where(eq(dataSubjectRequests.organizationId, orgId));
    const base = `/api/v1/data-subject-requests/${id}`;

    // Görev genel görev ekranından kapatılamaz, son tarihi değiştirilemez.
    await request(server).post(`/api/v1/tasks/${taskId}/complete`).set(as(officer.accessToken)).send({}).expect(409);
    await request(server).post(`/api/v1/tasks/${taskId}/cancel`).set(as(officer.accessToken)).expect(409);
    await request(server)
      .patch(`/api/v1/tasks/${taskId}`)
      .set(as(officer.accessToken))
      .send({ dueDate: addDays(targetDate, 5) })
      .expect(409);

    await request(server).post(`${base}/status`).set(as(officer.accessToken)).send({ status: 'in_review' }).expect(200);
    await request(server)
      .post(`${base}/status`)
      .set(as(officer.accessToken))
      .send({ status: 'awaiting_info', note: 'Kimlik fotokopisi istendi' })
      .expect(200);
    // 4 gün önce ek bilgi istenmiş gibi: devam edince iki tarih de 4 gün ileri alınır.
    const pausedOn = addDays(dateIn(new Date()), -4);
    await db.update(dataSubjectRequests).set({ pausedOn }).where(eq(dataSubjectRequests.id, id));
    const resumed = await request(server).post(`${base}/status`).set(as(officer.accessToken)).send({ status: 'in_review' }).expect(200);
    expect(resumed.body).toMatchObject({
      status: 'in_review',
      pausedOn: null,
      pausedDays: 4,
      targetDate: addDays(targetDate, 4),
      legalDueDate: addDays(legalDueDate, 4),
    });
    expect(resumed.body.task.dueDate).toBe(addDays(targetDate, 4));
    expect(resumed.body.events.map((e: any) => e.kind)).toEqual(['received', 'status_changed', 'info_requested', 'info_received']);

    await request(server).post(`${base}/notes`).set(as(officer.accessToken)).send({ note: 'İK ile görüşüldü' }).expect(200);

    // Yönetici cevap kaydedemez.
    const answer = { answeredOn: dateIn(new Date()), outcome: 'partially_accepted', method: 'email', summary: 'Adres düzeltildi; silme talebi yasal saklama süresi nedeniyle reddedildi.' };
    await request(server).post(`${base}/answer`).set(as(yonetici.accessToken)).field(answer).expect(403);
    await request(server)
      .post(`${base}/answer`)
      .set(as(officer.accessToken))
      .field({ ...answer, answeredOn: addDays(dateIn(new Date()), 1) })
      .expect(400);
    const answered = await request(server)
      .post(`${base}/answer`)
      .set(as(officer.accessToken))
      .field(answer)
      .attach('files', PDF, 'cevap-yazisi.pdf')
      .expect(200);
    expect(answered.body).toMatchObject({
      status: 'answered',
      answerOutcome: 'partially_accepted',
      responseDays: 0,
      answerRecordedBy: { id: officer.user.id },
    });
    expect(answered.body.task.status).toBe('done');
    expect(answered.body.files.map((f: any) => f.kind)).toEqual(['response']);
    await request(server).post(`${base}/status`).set(as(officer.accessToken)).send({ status: 'in_review' }).expect(409);

    // Cevap bilgisi sonradan düzeltilebilir.
    const updated = await request(server)
      .post(`${base}/answer`)
      .set(as(officer.accessToken))
      .field({ ...answer, outcome: 'accepted' })
      .expect(200);
    expect(updated.body.answerOutcome).toBe('accepted');
    expect(updated.body.events.at(-1).kind).toBe('answer_updated');

    const pdf = await request(server)
      .get(`${base}/pdf`)
      .set(as(yonetici.accessToken))
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');

    const report = await request(server).get('/api/v1/data-subject-requests/report').set(as(yonetici.accessToken)).expect(200);
    expect(report.body).toMatchObject({ total: 1, answered: 1, open: 0, targetDays: 20, legalDays: 30, answeredWithinTarget: 1 });
    expect(report.body.byOutcome.find((o: any) => o.key === 'accepted').count).toBe(1);
    expect(report.body.byItem.filter((i: any) => i.count > 0).map((i: any) => i.no)).toEqual([1, 5, 6]);
    expect(report.body.byRelationship.find((r: any) => r.key === 'former_employee').count).toBe(1);
  });

  it('Sorumlu elden veya noterden gelen başvuruyu girer', async () => {
    const { officer, as } = await setupOrg();
    const receivedOn = addDays(dateIn(new Date()), -3);
    const created = await request(server)
      .post('/api/v1/data-subject-requests')
      .set(as(officer.accessToken))
      .field({ ...APPLICATION, items: JSON.stringify(APPLICATION.items), responseMethod: 'postal', phone: '', channel: 'notary', receivedOn })
      .expect(201);
    expect(created.body).toMatchObject({
      channel: 'notary',
      code: 'B-0001',
      targetDate: addDays(receivedOn, 20),
      createdBy: { id: officer.user.id },
    });
    // Kendi girdiği başvuru için kendisine bildirim e-postası gitmez ama görev açılır.
    expect(created.body.task.assignee.id).toBe(officer.user.id);
    await request(server)
      .post('/api/v1/data-subject-requests')
      .set(as(officer.accessToken))
      .field({ ...APPLICATION, items: JSON.stringify(APPLICATION.items), channel: 'web_form', receivedOn })
      .expect(400);
  });

  it('hedef geçince yasal son güne kadar her gün hatırlatır; ek bilgi beklenirken hatırlatmaz', async () => {
    const { officer, orgId, key } = await setupOrg();
    await submit(key, { ...APPLICATION, email: 'c@ornek.com.tr' }).expect(201);
    const [r] = await db.select().from(dataSubjectRequests).where(eq(dataSubjectRequests.organizationId, orgId));
    const alarms = app.get(AlarmsService);
    const at = (date: string) => new Date(`${date}T09:00:00+03:00`);
    const titles = async () =>
      (await app.get(NotificationsService).list(orgId, officer.user.id, false)).items
        .filter((n) => n.taskId === r.taskId)
        .map((n) => n.title);

    await alarms.run(at(addDays(r.targetDate, 2)));
    expect(await titles()).toContain('Başvuru cevap süresi: yasal süreye 8 gün kaldı');
    await alarms.run(at(addDays(r.targetDate, 3)));
    expect(await titles()).toContain('Başvuru cevap süresi: yasal süreye 7 gün kaldı');
    await alarms.run(at(addDays(r.legalDueDate, 1)));
    expect((await titles()).some((t) => t.startsWith('Yasal cevap süresi geçti'))).toBe(true);

    const before = (await titles()).length;
    await db.update(dataSubjectRequests).set({ status: 'awaiting_info', pausedOn: r.targetDate }).where(eq(dataSubjectRequests.id, r.id));
    await alarms.run(at(addDays(r.legalDueDate, 9)));
    expect((await titles()).length).toBe(before);
    const [task] = await db.select().from(tasks).where(eq(tasks.id, r.taskId!));
    expect(task.status).toBe('open');
    expect(mailCount(app)).toBeGreaterThan(0);
  });
});
