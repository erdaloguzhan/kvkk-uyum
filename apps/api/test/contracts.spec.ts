import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp, extractCode, lastMailTo, login, registerAndLogin, uniqueEmail } from './helpers';

const CONTRACT = {
  partyName: 'Örnek Yazılım Ltd. Şti.',
  type: 'supplier',
  startDate: '2026-01-01',
  endDate: '2026-12-31',
  status: 'active',
  contactName: 'Ayşe Yılmaz',
  contactPhone: '0212 555 00 00',
  contactEmail: 'ayse@ornekyazilim.com.tr',
  description: 'Bordro yazılımı hizmeti; veri işleyen sözleşmesi ekte.',
};

describe('Sözleşmeler', () => {
  let app: INestApplication;
  let server: any;

  beforeAll(async () => {
    app = await createApp();
    server = app.getHttpServer();
  });
  afterAll(() => app.close());

  async function setupOrg() {
    const admin = await registerAndLogin(app);
    const res = await request(server)
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ name: 'Örnek Ticaret A.Ş.' })
      .expect(201);
    const orgId: string = res.body.id;
    const as = (token: string) => ({ Authorization: `Bearer ${token}`, 'X-Organization-Id': orgId });
    return { admin, orgId, as };
  }

  async function addViewer(admin: { accessToken: string }, as: (t: string) => any) {
    const roles = await request(server).get('/api/v1/roles').set(as(admin.accessToken)).expect(200);
    const roleId = roles.body.items.find((r: any) => r.key === 'viewer').id;
    const email = uniqueEmail('viewer');
    await request(server)
      .post('/api/v1/members')
      .set(as(admin.accessToken))
      .send({ email, fullName: 'Mehmet Demir', roleId })
      .expect(201);
    const token = extractCode(lastMailTo(app, email).text);
    await request(server)
      .post('/api/v1/auth/password-reset/confirm')
      .send({ token, password: 'DavetSifre2026' })
      .expect(204);
    return login(app, email, 'DavetSifre2026');
  }

  it('sözleşme ekler, listeler, günceller ve siler', async () => {
    const { admin, as } = await setupOrg();
    const created = await request(server).post('/api/v1/contracts').set(as(admin.accessToken)).send(CONTRACT).expect(201);
    expect(created.body).toMatchObject(CONTRACT);
    expect(typeof created.body.daysToEnd).toBe('number');

    await request(server)
      .post('/api/v1/contracts')
      .set(as(admin.accessToken))
      .send({ partyName: 'Ahmet Kaya', type: 'employee', startDate: '2025-03-01', contactEmail: '' })
      .expect(201)
      .expect((r) => {
        expect(r.body.status).toBe('draft');
        expect(r.body.endDate).toBeNull();
        expect(r.body.contactEmail).toBeNull();
        expect(r.body.daysToEnd).toBeNull();
      });

    const list = await request(server).get('/api/v1/contracts').set(as(admin.accessToken)).expect(200);
    expect(list.body.items.map((c: any) => c.partyName)).toEqual(['Ahmet Kaya', 'Örnek Yazılım Ltd. Şti.']);

    const filtered = await request(server)
      .get('/api/v1/contracts')
      .query({ type: 'supplier', q: 'ayşe' })
      .set(as(admin.accessToken))
      .expect(200);
    expect(filtered.body.items).toHaveLength(1);

    const updated = await request(server)
      .patch(`/api/v1/contracts/${created.body.id}`)
      .set(as(admin.accessToken))
      .send({ status: 'terminated', description: '' })
      .expect(200);
    expect(updated.body).toMatchObject({ status: 'terminated', description: null, partyName: CONTRACT.partyName });

    await request(server).delete(`/api/v1/contracts/${created.body.id}`).set(as(admin.accessToken)).expect(204);
    await request(server).get(`/api/v1/contracts/${created.body.id}`).set(as(admin.accessToken)).expect(404);

    const audit = await request(server).get('/api/v1/audit-logs').set(as(admin.accessToken)).expect(200);
    const actions = audit.body.items.map((a: any) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['contract.created', 'contract.updated', 'contract.deleted']));
  });

  it('hatalı tür, e-posta ve tarih sırasını reddeder', async () => {
    const { admin, as } = await setupOrg();
    await request(server)
      .post('/api/v1/contracts')
      .set(as(admin.accessToken))
      .send({ ...CONTRACT, type: 'bayi' })
      .expect(400);
    await request(server)
      .post('/api/v1/contracts')
      .set(as(admin.accessToken))
      .send({ ...CONTRACT, contactEmail: 'gecersiz' })
      .expect(400);
    await request(server)
      .post('/api/v1/contracts')
      .set(as(admin.accessToken))
      .send({ ...CONTRACT, startDate: '2026-05-01', endDate: '2026-04-01' })
      .expect(400);

    const created = await request(server).post('/api/v1/contracts').set(as(admin.accessToken)).send(CONTRACT).expect(201);
    // Yalnızca başlangıç değişse de mevcut bitiş tarihiyle karşılaştırılır.
    await request(server)
      .patch(`/api/v1/contracts/${created.body.id}`)
      .set(as(admin.accessToken))
      .send({ startDate: '2027-01-01' })
      .expect(400);
  });

  it('görüntüleyici listeleyebilir ama değiştiremez; başka kuruluşun sözleşmesi görünmez', async () => {
    const { admin, as } = await setupOrg();
    const created = await request(server).post('/api/v1/contracts').set(as(admin.accessToken)).send(CONTRACT).expect(201);
    const viewer = await addViewer(admin, as);
    await request(server).get('/api/v1/contracts').set(as(viewer.accessToken)).expect(200);
    await request(server).post('/api/v1/contracts').set(as(viewer.accessToken)).send(CONTRACT).expect(403);
    await request(server)
      .patch(`/api/v1/contracts/${created.body.id}`)
      .set(as(viewer.accessToken))
      .send({ status: 'expired' })
      .expect(403);

    const other = await setupOrg();
    await request(server).get(`/api/v1/contracts/${created.body.id}`).set(other.as(other.admin.accessToken)).expect(404);
    const otherList = await request(server).get('/api/v1/contracts').set(other.as(other.admin.accessToken)).expect(200);
    expect(otherList.body.items).toHaveLength(0);
  });
});
