import { INestApplication } from '@nestjs/common';
import PizZip from 'pizzip';
import request from 'supertest';
import { AlarmsService } from '../src/workflow/alarms.service';
import { addMember, createApp, createOrg, registerAndLogin } from './helpers';

const HOUR = 60 * 60 * 1000;

const FORM = {
  description: 'Bordro listesi yanlışlıkla tedarikçiye e-postayla gönderildi.',
  sources: ['Kişisel verilerin yanlış alıcılara gönderilmesi'],
  personalCategories: ['Kimlik', 'Finans'],
  specialCategories: ['Sağlık Bilgileri'],
  estimatedPeople: 42,
  estimatedRecords: 42,
  subjectGroups: ['Çalışanlar'],
  subjectEffects: ['Finansal kayıp'],
  likelihood: 'medium',
  orgImpact: 'low',
  orgRecovery: 'complete',
  cyberAttack: false,
  staffTrained: true,
  measuresAfter: 'Alıcıdan e-postanın silindiğine dair yazılı teyit alındı.',
  subjectNotice: 'yes',
};

describe('Veri ihlali olay yönetimi', () => {
  let app: INestApplication;
  let server: any;

  beforeAll(async () => {
    app = await createApp();
    server = app.getHttpServer();
  });
  afterAll(() => app.close());

  async function setup() {
    const owner = await registerAndLogin(app);
    const orgId = await createOrg(app, owner, { name: 'Örnek Sağlık A.Ş.', address: 'Atatürk Cad. No:1 Ankara' });
    const officer = await addMember(app, orgId, 'kvkk_officer', 'Selin Sorumlu');
    const manager = await addMember(app, orgId, 'approver', 'Zeynep Yönetici');
    const as = (u: { accessToken: string }) => ({ Authorization: `Bearer ${u.accessToken}`, 'X-Organization-Id': orgId });
    return { orgId, owner, officer, manager, as };
  }

  it('olay kaydı açar, onaya gönderir, onaylanır, Kurula bildirilir ve takip bildirimi oluşturulur', async () => {
    const { officer, manager, as } = await setup();
    const detectedAt = new Date(Date.now() - 2 * HOUR).toISOString();
    const created = await request(server)
      .post('/api/v1/incidents')
      .set(as(officer))
      .send({ title: 'Bordro e-postası yanlış alıcıya', detectedAt, occurredAt: new Date(Date.now() - 3 * HOUR).toISOString(), form: FORM })
      .expect(201);
    const i = created.body;
    expect(i).toMatchObject({ number: 1, status: 'draft', notificationType: 'initial', overdue: false });
    expect(i.hoursLeft).toBeGreaterThanOrEqual(69);
    // A bölümü kuruluş ve kaydı açan kişiden dolar.
    expect(i.form).toMatchObject({
      controllerName: 'Örnek Sağlık A.Ş.',
      controllerAddress: 'Atatürk Cad. No:1 Ankara',
      preparerName: 'Selin Sorumlu',
      preparerTitle: 'KVKK Sorumlusu',
      preparerEmail: officer.email,
      sources: FORM.sources,
    });

    // Yönetici kaydı görür ama açamaz/değiştiremez; kaydın açıldığı ona bildirilir.
    await request(server).get(`/api/v1/incidents/${i.id}`).set(as(manager)).expect(200);
    await request(server).post('/api/v1/incidents').set(as(manager)).send({ title: 'x', detectedAt }).expect(403);
    await request(server).patch(`/api/v1/incidents/${i.id}`).set(as(manager)).send({ title: 'x' }).expect(403);
    const notes = await request(server).get('/api/v1/notifications').set(as(manager)).expect(200);
    expect(notes.body.items.map((n: any) => n.kind)).toContain('incident_recorded');

    await request(server)
      .patch(`/api/v1/incidents/${i.id}`)
      .set(as(officer))
      .send({ form: { sources: ['Bilinmeyen kaynak'] } })
      .expect(400);
    await request(server)
      .patch(`/api/v1/incidents/${i.id}`)
      .set(as(officer))
      .send({ form: { measuresBefore: 'E-posta gönderiminde alıcı kontrolü eğitimi verilmişti.' } })
      .expect(200)
      .expect((r) => expect(r.body.form.description).toBe(FORM.description));

    // Onaylayıcı Yönetici yetkisinde olmalı.
    await request(server).post(`/api/v1/incidents/${i.id}/submit`).set(as(officer)).send({ approverId: officer.user.id }).expect(400);
    const submitted = await request(server)
      .post(`/api/v1/incidents/${i.id}/submit`)
      .set(as(officer))
      .send({ approverId: manager.user.id })
      .expect(200);
    expect(submitted.body).toMatchObject({ status: 'pending_approval', approver: { fullName: 'Zeynep Yönetici' } });
    await request(server).patch(`/api/v1/incidents/${i.id}`).set(as(officer)).send({ title: 'Değişti' }).expect(409);

    // Yönetici görevinden onaylar.
    const tasks = await request(server).get('/api/v1/tasks').set(as(manager)).expect(200);
    expect(tasks.body.items.find((t: any) => t.entityId === i.id)).toMatchObject({ type: 'approval', entityType: 'incident' });
    await request(server).post(`/api/v1/incidents/${i.id}/approve`).set(as(officer)).send({}).expect(403);
    await request(server).post(`/api/v1/incidents/${i.id}/approve`).set(as(manager)).send({ note: 'Uygundur' }).expect(200);

    const docx = await request(server)
      .get(`/api/v1/incidents/${i.id}/form.docx`)
      .set(as(manager))
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(docx.headers['content-disposition']).toContain('FRM-020');
    const xml = new PizZip(docx.body).file('word/document.xml')!.asText();
    expect(xml).toContain('Kişisel Veri İhlali Bildirim Formu');
    expect(xml).toContain('Örnek Sağlık A.Ş.');
    expect(xml).toContain('☒ Kişisel verilerin yanlış alıcılara gönderilmesi');
    expect(xml).toContain('☐ Zararlı yazılımlar');
    expect(xml).toContain('☒ Sağlık Bilgileri');
    expect(xml).toContain('☒ İlk bildirim');
    expect(xml).toContain('ihlalbildirimi@kvkk.gov.tr');

    // Yönetici de Kurula bildirildi olarak işaretleyebilir.
    const notified = await request(server)
      .post(`/api/v1/incidents/${i.id}/notified`)
      .set(as(manager))
      .send({ note: 'ihlalbildirimi@kvkk.gov.tr adresine gönderildi' })
      .expect(200);
    expect(notified.body).toMatchObject({ status: 'notified', notifiedOnTime: true, hoursLeft: null });

    const followUp = await request(server).post(`/api/v1/incidents/${i.id}/follow-up`).set(as(officer)).expect(201);
    expect(followUp.body).toMatchObject({
      number: 2,
      notificationType: 'follow_up',
      parentId: i.id,
      status: 'draft',
      deadlineAt: null,
      parent: { id: i.id },
    });
    expect(followUp.body.form.description).toBe(FORM.description);

    const report = await request(server).get('/api/v1/incidents/report').set(as(manager)).expect(200);
    expect(report.body).toMatchObject({ total: 1, followUps: 1, notified: 1, notifiedOnTime: 1, notifiedLate: 0, estimatedPeople: 42, specialCategoryIncidents: 1 });
    expect(report.body.bySource).toEqual([{ label: 'Kişisel verilerin yanlış alıcılara gönderilmesi', count: 1 }]);

    const audit = await request(server).get('/api/v1/audit-logs').set(as(officer)).expect(200);
    expect(audit.body.items.map((a: any) => a.action)).toEqual(
      expect.arrayContaining(['incident.created', 'incident.submitted', 'incident.approved', 'incident.notified', 'incident.follow_up_created']),
    );
  });

  it('eksik veya geciken kaydı onaya göndermez; geri çevrilen kayıt düzenlenebilir', async () => {
    const { officer, manager, as } = await setup();
    const late = await request(server)
      .post('/api/v1/incidents')
      .set(as(officer))
      .send({ title: 'Kayıp dizüstü bilgisayar', detectedAt: new Date(Date.now() - 80 * HOUR).toISOString() })
      .expect(201);
    expect(late.body.overdue).toBe(true);

    const incomplete = await request(server)
      .post(`/api/v1/incidents/${late.body.id}/submit`)
      .set(as(officer))
      .send({ approverId: manager.user.id })
      .expect(400);
    expect(incomplete.body.errors.map((e: any) => e.path)).toEqual(['description', 'sources', 'personalCategories', 'likelihood', 'delayReason']);

    await request(server)
      .patch(`/api/v1/incidents/${late.body.id}`)
      .set(as(officer))
      .send({ form: { ...FORM, delayReason: 'Kayıp hafta sonu fark edildi.' } })
      .expect(200);
    await request(server).post(`/api/v1/incidents/${late.body.id}/submit`).set(as(officer)).send({ approverId: manager.user.id }).expect(200);
    await request(server).post(`/api/v1/incidents/${late.body.id}/reject`).set(as(manager)).send({}).expect(400);
    const rejected = await request(server)
      .post(`/api/v1/incidents/${late.body.id}/reject`)
      .set(as(manager))
      .send({ note: 'Etkilenen kişi sayısını netleştirin.' })
      .expect(200);
    expect(rejected.body).toMatchObject({ status: 'draft', decision: 'rejected', decisionNote: 'Etkilenen kişi sayısını netleştirin.' });

    // Onaylanmadan Kurula bildirildi işaretlenemez; gerekçeyle "bildirim gerekmedi" kapatılabilir.
    await request(server).post(`/api/v1/incidents/${late.body.id}/notified`).set(as(officer)).send({}).expect(409);
    await request(server).post(`/api/v1/incidents/${late.body.id}/close`).set(as(officer)).send({}).expect(400);
    await request(server)
      .post(`/api/v1/incidents/${late.body.id}/close`)
      .set(as(officer))
      .send({ note: 'Cihaz şifreliydi; risk değerlendirmesi sonucu bildirim gerekmedi.' })
      .expect(200)
      .expect((r) => expect(r.body).toMatchObject({ status: 'closed', overdue: false }));
    await request(server).delete(`/api/v1/incidents/${late.body.id}`).set(as(officer)).expect(409);

    await request(server)
      .post('/api/v1/incidents')
      .set(as(officer))
      .send({ title: 'Gelecek', detectedAt: new Date(Date.now() + 2 * HOUR).toISOString() })
      .expect(400);
  });

  it('72 saat dolmadan uyarır, süre geçince alarm üretir', async () => {
    const { officer, manager, as } = await setup();
    const now = new Date();
    const created = await request(server)
      .post('/api/v1/incidents')
      .set(as(officer))
      .send({ title: 'Zararlı yazılım', detectedAt: new Date(now.getTime() - 50 * HOUR).toISOString() })
      .expect(201);
    const alarms = app.get(AlarmsService);
    await alarms.run(now);
    await alarms.run(now);
    const kinds = async (u: { accessToken: string }) =>
      (await request(server).get('/api/v1/notifications').set(as(u)).expect(200)).body.items
        .filter((n: any) => n.incidentId === created.body.id && n.kind === 'incident_deadline')
        .map((n: any) => n.title);
    expect(await kinds(manager)).toEqual([expect.stringContaining('saat kaldı')]);
    expect(await kinds(officer)).toHaveLength(1);

    await alarms.run(new Date(now.getTime() + 23 * HOUR));
    expect(await kinds(manager)).toEqual([expect.stringContaining('süresi geçti'), expect.stringContaining('saat kaldı')]);
  });
});
