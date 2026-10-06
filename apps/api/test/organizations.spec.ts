import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp, extractCode, lastMailTo, login, registerAndLogin, uniqueEmail } from './helpers';

describe('Kuruluşlar, üyeler ve roller', () => {
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
    const roles = await request(server).get('/api/v1/roles').set(as(admin.accessToken)).expect(200);
    const roleId = (key: string) => roles.body.items.find((r: any) => r.key === key).id;
    return { admin, orgId, as, roleId };
  }

  it('kuruluş oluşturur, varsayılan rolleri ve deneme lisansını ekler', async () => {
    const { admin, orgId, as } = await setupOrg();
    const me = await request(server)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(me.body.organizations).toHaveLength(1);
    expect(me.body.organizations[0]).toMatchObject({
      id: orgId,
      licenseStatus: 'trial',
      role: { key: 'org_admin' },
    });

    const roles = await request(server).get('/api/v1/roles').set(as(admin.accessToken)).expect(200);
    expect(roles.body.items.map((r: any) => r.key).sort()).toEqual(['kvkk_officer', 'org_admin', 'viewer']);
  });

  it('kurulum, firma bilgileri tamamlanmadan bitirilemez', async () => {
    const { admin, as } = await setupOrg();
    const incomplete = await request(server)
      .post('/api/v1/organizations/current/complete-setup')
      .set(as(admin.accessToken))
      .expect(400);
    expect(incomplete.body.missing).toEqual(
      expect.arrayContaining(['address', 'email', 'phone', 'kepAddress', 'authorizedPerson', 'taxNumber']),
    );

    await request(server)
      .patch('/api/v1/organizations/current')
      .set(as(admin.accessToken))
      .send({ taxNumber: '12345' })
      .expect(400);

    await request(server)
      .patch('/api/v1/organizations/current')
      .set(as(admin.accessToken))
      .send({
        address: 'Atatürk Cad. No:1 Ankara',
        email: 'info@ornek.com.tr',
        phone: '+90 312 000 00 00',
        kepAddress: 'ornek@hs01.kep.tr',
        authorizedPerson: 'Ayşe Yılmaz',
        taxNumber: '1234567890',
        website: 'www.ornek.com.tr',
      })
      .expect(200);
    const done = await request(server)
      .post('/api/v1/organizations/current/complete-setup')
      .set(as(admin.accessToken))
      .expect(200);
    expect(done.body.setupCompletedAt).toBeTruthy();
  });

  it('üye olmayan kullanıcı kuruluşa erişemez', async () => {
    const { orgId } = await setupOrg();
    const outsider = await registerAndLogin(app);
    await request(server)
      .get('/api/v1/organizations/current')
      .set({ Authorization: `Bearer ${outsider.accessToken}`, 'X-Organization-Id': orgId })
      .expect(403);
    await request(server)
      .get('/api/v1/organizations/current')
      .set({ Authorization: `Bearer ${outsider.accessToken}` })
      .expect(400);
  });

  it('yeni kullanıcıyı davet eder, davetli şifresini belirleyip rolü kadar yetki alır', async () => {
    const { admin, as, roleId } = await setupOrg();
    const email = uniqueEmail('davetli');
    const added = await request(server)
      .post('/api/v1/members')
      .set(as(admin.accessToken))
      .send({ email, fullName: 'Mehmet Demir', roleId: roleId('viewer') })
      .expect(201);

    const token = extractCode(lastMailTo(app, email).text);
    await request(server)
      .post('/api/v1/auth/password-reset/confirm')
      .send({ token, password: 'DavetSifre2026' })
      .expect(204);
    const viewer = await login(app, email, 'DavetSifre2026');

    // Görüntüleyici okuyabilir ama yönetemez.
    await request(server).get('/api/v1/organizations/current').set(as(viewer.accessToken)).expect(200);
    await request(server).get('/api/v1/members').set(as(viewer.accessToken)).expect(200);
    await request(server)
      .patch('/api/v1/organizations/current')
      .set(as(viewer.accessToken))
      .send({ name: 'Değiştirildi' })
      .expect(403);

    // Yetki yükseltilince yönetebilir.
    await request(server)
      .patch(`/api/v1/members/${added.body.id}`)
      .set(as(admin.accessToken))
      .send({ roleId: roleId('org_admin') })
      .expect(200);
    await request(server)
      .patch('/api/v1/organizations/current')
      .set(as(viewer.accessToken))
      .send({ phone: '+90 212 000 00 00' })
      .expect(200);

    // Devre dışı bırakılan üye erişemez.
    await request(server)
      .patch(`/api/v1/members/${added.body.id}`)
      .set(as(admin.accessToken))
      .send({ status: 'disabled' })
      .expect(200);
    await request(server).get('/api/v1/organizations/current').set(as(viewer.accessToken)).expect(403);
  });

  it('son yönetici kaldırılamaz veya düşürülemez', async () => {
    const { admin, as, roleId } = await setupOrg();
    const members = await request(server).get('/api/v1/members').set(as(admin.accessToken)).expect(200);
    const own = members.body.items[0];
    await request(server)
      .patch(`/api/v1/members/${own.id}`)
      .set(as(admin.accessToken))
      .send({ roleId: roleId('viewer') })
      .expect(400);
    await request(server).delete(`/api/v1/members/${own.id}`).set(as(admin.accessToken)).expect(400);
  });

  it('özel rol oluşturur; sistem rolleri ve kullanımdaki roller korunur', async () => {
    const { admin, as, roleId } = await setupOrg();
    await request(server)
      .post('/api/v1/roles')
      .set(as(admin.accessToken))
      .send({ name: 'Hatalı', permissions: ['olmayan.yetki'] })
      .expect(400);
    const created = await request(server)
      .post('/api/v1/roles')
      .set(as(admin.accessToken))
      .send({ name: 'Envanter Sorumlusu', permissions: ['inventory.read', 'inventory.write', 'inventory.read'] })
      .expect(201);
    expect(created.body.permissions).toEqual(['inventory.read', 'inventory.write']);

    await request(server)
      .patch(`/api/v1/roles/${roleId('org_admin')}`)
      .set(as(admin.accessToken))
      .send({ name: 'X' })
      .expect(400);

    await request(server)
      .post('/api/v1/members')
      .set(as(admin.accessToken))
      .send({ email: uniqueEmail(), fullName: 'Ali Kaya', roleId: created.body.id })
      .expect(201);
    await request(server).delete(`/api/v1/roles/${created.body.id}`).set(as(admin.accessToken)).expect(409);
  });

  it('başka kuruluşun rolü atanamaz', async () => {
    const a = await setupOrg();
    const b = await setupOrg();
    await request(server)
      .post('/api/v1/members')
      .set(a.as(a.admin.accessToken))
      .send({ email: uniqueEmail(), fullName: 'Ali Kaya', roleId: b.roleId('viewer') })
      .expect(400);
  });

  it('sistem hareketlerini kuruluş bazında loglar', async () => {
    const { admin, as } = await setupOrg();
    await request(server)
      .patch('/api/v1/organizations/current')
      .set(as(admin.accessToken))
      .send({ phone: '+90 312 111 11 11' })
      .expect(200);
    const logs = await request(server).get('/api/v1/audit-logs').set(as(admin.accessToken)).expect(200);
    const actions = logs.body.items.map((l: any) => l.action);
    expect(actions).toEqual(expect.arrayContaining(['organization.created', 'organization.updated']));
    expect(logs.body.items[0].user.email).toBe(admin.email);
  });
});
