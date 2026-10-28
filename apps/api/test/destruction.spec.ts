import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { addMember, createApp, createOrg, registerAndLogin } from './helpers';

const ENTRY = {
  department: 'İnsan Kaynakları',
  activity: 'Özlük dosyası',
  dataCategory: 'Kimlik',
  personalData: 'Ad, soyad, T.C. kimlik no',
  storageMedium: 'physical',
  retentionPeriod: 'İş ilişkisi bitiminden 10 yıl',
};

describe('Kişisel veri imha yönetimi', () => {
  let app: INestApplication;
  let server: any;

  beforeAll(async () => {
    app = await createApp();
    server = app.getHttpServer();
  });
  afterAll(() => app.close());

  async function setupOrg() {
    const owner = await registerAndLogin(app);
    const orgId = await createOrg(app, owner, { name: 'Örnek İmha A.Ş.' });
    const as = (token: string) => ({ Authorization: `Bearer ${token}`, 'X-Organization-Id': orgId });
    return { owner, orgId, as };
  }

  it('imha sorumlusu değişince önceki sorumlunun dönemi kapanır ve geçmişte kalır', async () => {
    const { owner, as } = await setupOrg();
    const h = as(owner.accessToken);
    const first = await request(server)
      .post('/api/v1/destruction/officers')
      .set(h)
      .send({ fullName: 'Ali Veli', title: 'Bilgi İşlem Sorumlusu', startDate: '2025-01-01' })
      .expect(201);
    expect(first.body.endDate).toBeNull();

    // Yeni sorumlu mevcut sorumludan önce başlayamaz.
    await request(server).post('/api/v1/destruction/officers').set(h).send({ fullName: 'X', startDate: '2024-06-01' }).expect(400);

    await request(server)
      .post('/api/v1/destruction/officers')
      .set(h)
      .send({ fullName: 'Ayşe Kaya', title: 'İK Müdürü', startDate: '2026-03-01' })
      .expect(201);
    const list = await request(server).get('/api/v1/destruction/officers').set(h).expect(200);
    expect(list.body.items.map((o: any) => [o.fullName, o.startDate, o.endDate, o.current])).toEqual([
      ['Ayşe Kaya', '2026-03-01', null, true],
      ['Ali Veli', '2025-01-01', '2026-02-28', false],
    ]);

    // Geçmiş dönem eklenebilir ama mevcut dönemlerle çakışamaz.
    await request(server)
      .post('/api/v1/destruction/officers')
      .set(h)
      .send({ fullName: 'Can Er', startDate: '2025-06-01', endDate: '2025-07-01' })
      .expect(400);
    await request(server)
      .post('/api/v1/destruction/officers')
      .set(h)
      .send({ fullName: 'Can Er', startDate: '2024-01-01', endDate: '2024-12-31' })
      .expect(201);
  });

  it('periyodik imha süresi parametre olarak tutulur', async () => {
    const { owner, as } = await setupOrg();
    const h = as(owner.accessToken);
    const initial = await request(server).get('/api/v1/destruction/settings').set(h).expect(200);
    expect(initial.body).toMatchObject({ periodMonths: 6, lastPlanEnd: null, uncovered: true });
    await request(server).put('/api/v1/destruction/settings').set(h).send({ periodMonths: 9 }).expect(400);
    const updated = await request(server).put('/api/v1/destruction/settings').set(h).send({ periodMonths: 3 }).expect(200);
    expect(updated.body.periodMonths).toBe(3);
  });

  it('envanterden plan hazırlanır, Yönetici onaylar, imha kaydı açılır', async () => {
    const { owner, orgId, as } = await setupOrg();
    const officer = await addMember(app, orgId, 'kvkk_officer', 'Selin Sorumlu');
    const yonetici = await addMember(app, orgId, 'approver', 'Zeynep Yönetici');
    const s = as(officer.accessToken);
    const y = as(yonetici.accessToken);

    const entry = await request(server).post('/api/v1/inventory').set(as(owner.accessToken)).send(ENTRY).expect(201);
    await request(server)
      .post('/api/v1/inventory')
      .set(as(owner.accessToken))
      .send({ ...ENTRY, activity: 'Bordro', dataCategory: 'Finans', storageMedium: 'digital', retentionPeriod: '10 yıl' })
      .expect(201);
    const sorumlu = await request(server)
      .post('/api/v1/destruction/officers')
      .set(s)
      .send({ fullName: 'Ali Veli', startDate: '2026-01-01' })
      .expect(201);

    const plan = await request(server)
      .post('/api/v1/destruction/plans')
      .set(s)
      .send({ title: '2026 / 2. dönem', periodStart: '2026-07-01', periodEnd: '2026-12-31', fromInventory: true })
      .expect(201);
    expect(plan.body.status).toBe('draft');
    expect(plan.body.items).toHaveLength(2);
    const physical = plan.body.items.find((i: any) => i.inventoryEntryId === entry.body.id);
    expect(physical).toMatchObject({
      dataDescription: 'İnsan Kaynakları / Özlük dosyası / Kimlik',
      storageMedium: 'physical',
      retentionPeriod: 'İş ilişkisi bitiminden 10 yıl',
      plannedDate: '2026-12-31',
      operationType: 'destruction',
      officerId: sorumlu.body.id,
      officerName: 'Ali Veli',
      status: 'planned',
    });
    expect(plan.body.items.find((i: any) => i.storageMedium === 'digital').operationType).toBe('deletion');

    // Aynı satırlar ikinci kez eklenmez.
    const again = await request(server)
      .post(`/api/v1/destruction/plans/${plan.body.id}/items/from-inventory`)
      .set(s)
      .send({})
      .expect(200);
    expect(again.body.added).toBe(0);

    // Yönetici plan hazırlayamaz; Sorumlu onaylayamaz.
    await request(server).post('/api/v1/destruction/plans').set(y).send({ title: 'x', periodStart: '2026-01-01', periodEnd: '2026-06-30' }).expect(403);
    await request(server).get(`/api/v1/destruction/plans/${plan.body.id}`).set(y).expect(200);

    // Sorumlu onay yetkisi olmayan birini onaylayıcı seçemez.
    await request(server)
      .post(`/api/v1/destruction/plans/${plan.body.id}/submit`)
      .set(s)
      .send({ approverId: officer.user.id })
      .expect(400);
    const submitted = await request(server)
      .post(`/api/v1/destruction/plans/${plan.body.id}/submit`)
      .set(s)
      .send({ approverId: yonetici.user.id, note: 'Kontrol eder misiniz?' })
      .expect(200);
    expect(submitted.body.status).toBe('pending');

    // Onay beklerken plan değiştirilemez.
    await request(server).patch(`/api/v1/destruction/items/${physical.id}`).set(s).send({ plannedDate: '2026-11-30' }).expect(409);
    await request(server).post(`/api/v1/destruction/plans/${plan.body.id}/approve`).set(s).send({}).expect(403);

    const approved = await request(server).post(`/api/v1/destruction/plans/${plan.body.id}/approve`).set(y).send({}).expect(200);
    expect(approved.body.status).toBe('approved');

    // Her imha işi için Sorumluya planlanan tarihte son günü olan hatırlatma görevi açılır.
    const tasks = await request(server).get('/api/v1/tasks').query({ type: 'data_destruction' }).set(s).expect(200);
    expect(tasks.body.items).toHaveLength(2);
    expect(tasks.body.items[0]).toMatchObject({ dueDate: '2026-12-31', entityType: 'destruction_item', assignee: { id: officer.user.id } });
    const physicalTask = tasks.body.items.find((t: any) => t.entityId === physical.id);
    // Bu görev Görevler sayfasından kapatılamaz; imha kaydı girilince kapanır.
    await request(server).post(`/api/v1/tasks/${physicalTask.id}/complete`).set(s).send({}).expect(409);

    // Sorumlu değişikliği onayı bozmaz.
    const yeni = await request(server)
      .post('/api/v1/destruction/officers')
      .set(s)
      .send({ fullName: 'Ayşe Kaya', startDate: '2026-09-01' })
      .expect(201);
    await request(server).patch(`/api/v1/destruction/items/${physical.id}`).set(s).send({ officerId: yeni.body.id }).expect(200);
    expect((await request(server).get(`/api/v1/destruction/plans/${plan.body.id}`).set(s)).body.status).toBe('approved');

    // İmha gerçekleşti: kayıt açılır, iş ve görev kapanır.
    const record = await request(server)
      .post(`/api/v1/destruction/items/${physical.id}/complete`)
      .set(s)
      .send({ performedDate: '2026-01-15', performedNote: 'Evraklar kağıt imha makinesinde imha edildi, tutanak no 12.' })
      .expect(201);
    expect(record.body).toMatchObject({
      planTitle: '2026 / 2. dönem',
      operationType: 'destruction',
      officerName: 'Ayşe Kaya',
      plannedDate: '2026-12-31',
    });
    await request(server).post(`/api/v1/destruction/items/${physical.id}/complete`).set(s).send({ performedDate: '2026-01-15', performedNote: 'tekrar' }).expect(409);
    const doneTask = await request(server).get(`/api/v1/tasks/${physicalTask.id}`).set(s).expect(200);
    expect(doneTask.body.status).toBe('done');

    // Plan dışı imha kaydı elle eklenir.
    await request(server)
      .post('/api/v1/destruction/records')
      .set(s)
      .send({ dataDescription: 'İlgili kişinin silme talebi', performedDate: '2026-01-10', operationType: 'deletion', performedNote: 'CRM kaydı silindi' })
      .expect(201);
    const records = await request(server).get('/api/v1/destruction/records').set(y).expect(200);
    expect(records.body.items.map((r: any) => r.dataDescription)).toEqual([
      'İnsan Kaynakları / Özlük dosyası / Kimlik',
      'İlgili kişinin silme talebi',
    ]);
    expect(records.body.items[1].officerName).toBe('Ali Veli');

    // Planın veri/tarih değişikliği onaylı planı taslağa döndürür.
    const other = plan.body.items.find((i: any) => i.storageMedium === 'digital');
    await request(server).patch(`/api/v1/destruction/items/${other.id}`).set(s).send({ plannedDate: '2026-11-30' }).expect(200);
    const after = await request(server).get(`/api/v1/destruction/plans/${plan.body.id}`).set(s).expect(200);
    expect(after.body.status).toBe('draft');
    expect(after.body.items.find((i: any) => i.id === physical.id).record.performedDate).toBe('2026-01-15');

    // Gerçekleşmiş imha içeren plan silinemez.
    await request(server).delete(`/api/v1/destruction/plans/${plan.body.id}`).set(s).expect(409);

    // Kayıt silinirse iş yeniden planlanır, görev yeniden açılır.
    await request(server).delete(`/api/v1/destruction/records/${record.body.id}`).set(s).expect(204);
    const reverted = await request(server).get(`/api/v1/destruction/plans/${plan.body.id}`).set(s).expect(200);
    expect(reverted.body.items.find((i: any) => i.id === physical.id).status).toBe('planned');
    expect((await request(server).get(`/api/v1/tasks/${physicalTask.id}`).set(s)).body.status).toBe('open');
  });

  it('sonraki dönemin planı periyodik imha süresine göre açılır', async () => {
    const { owner, as } = await setupOrg();
    const h = as(owner.accessToken);
    await request(server).put('/api/v1/destruction/settings').set(h).send({ periodMonths: 6 }).expect(200);
    const plan = await request(server)
      .post('/api/v1/destruction/plans')
      .set(h)
      .send({ title: '2026 / 1. dönem', periodStart: '2026-01-01', periodEnd: '2026-06-30' })
      .expect(201);
    const item = await request(server)
      .post(`/api/v1/destruction/plans/${plan.body.id}/items`)
      .set(h)
      .send({ dataDescription: 'Ziyaretçi kayıtları', plannedDate: '2026-03-15', operationType: 'deletion', storageMedium: 'digital' })
      .expect(201);
    await request(server)
      .post(`/api/v1/destruction/plans/${plan.body.id}/items`)
      .set(h)
      .send({ dataDescription: 'İptal edilecek', plannedDate: '2026-03-15', operationType: 'deletion' })
      .expect(201)
      .then((r) => request(server).post(`/api/v1/destruction/items/${r.body.id}/cancel`).set(h).send({ reason: 'Saklama süresi dolmadı' }).expect(200));

    const next = await request(server).post(`/api/v1/destruction/plans/${plan.body.id}/next`).set(h).send({}).expect(201);
    expect(next.body).toMatchObject({ periodStart: '2026-07-01', periodEnd: '2026-12-31', status: 'draft' });
    expect(next.body.items).toHaveLength(1);
    expect(next.body.items[0]).toMatchObject({ dataDescription: item.body.dataDescription, plannedDate: '2026-09-15' });

    const settings = await request(server).get('/api/v1/destruction/settings').set(h).expect(200);
    expect(settings.body.lastPlanEnd).toBe('2026-12-31');
  });

  it('başka kuruluşun kayıtlarına erişilemez', async () => {
    const a = await setupOrg();
    const b = await setupOrg();
    const plan = await request(server)
      .post('/api/v1/destruction/plans')
      .set(a.as(a.owner.accessToken))
      .send({ title: 'A planı', periodStart: '2026-01-01', periodEnd: '2026-06-30' })
      .expect(201);
    await request(server).get(`/api/v1/destruction/plans/${plan.body.id}`).set(b.as(b.owner.accessToken)).expect(404);
    await request(server)
      .post(`/api/v1/destruction/plans/${plan.body.id}/items`)
      .set(b.as(b.owner.accessToken))
      .send({ dataDescription: 'x', plannedDate: '2026-03-01', operationType: 'deletion' })
      .expect(404);
  });
});
