import { INestApplication } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import request from 'supertest';
import { Database, DB } from '../src/db/db.module';
import { auditLogs } from '../src/db/schema';
import { MembersService } from '../src/members/members.service';
import { addMember, createApp, createOrg, registerAndLogin, uniqueEmail } from './helpers';

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
    const orgId = await createOrg(app, admin, { name: 'Örnek Ticaret A.Ş.' });
    const as = (token: string) => ({ Authorization: `Bearer ${token}`, 'X-Organization-Id': orgId });
    return { admin, orgId, as };
  }

  it('kuruluş oluşturur, sabit rolleri ve deneme lisansını ekler', async () => {
    const { admin, orgId, as } = await setupOrg();
    const me = await request(server)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(me.body.organizations).toHaveLength(1);
    expect(me.body.organizations[0]).toMatchObject({
      id: orgId,
      licenseStatus: 'trial',
      role: { key: 'officer_approver' },
    });

    const roles = await request(server).get('/api/v1/roles').set(as(admin.accessToken)).expect(200);
    expect(roles.body.items.map((r: any) => r.key)).toEqual(['officer_approver', 'kvkk_officer', 'approver']);
    // Müşteri özel rol tanımlayamaz.
    await request(server).post('/api/v1/roles').set(as(admin.accessToken)).send({ name: 'X', permissions: [] }).expect(404);
  });

  it('kurulum, firma bilgileri tamamlanmadan bitirilemez', async () => {
    const { admin, as } = await setupOrg();
    const incomplete = await request(server)
      .post('/api/v1/organizations/current/complete-setup')
      .set(as(admin.accessToken))
      .expect(400);
    expect(incomplete.body.missing).toEqual(
      expect.arrayContaining(['address', 'email', 'phone', 'authorizedPerson', 'taxNumber']),
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

  it('rollere göre yetki uygular; müşteri kullanıcı ekleyemez', async () => {
    const { admin, orgId, as } = await setupOrg();
    const officer = await addMember(app, orgId, 'kvkk_officer');
    const approver = await addMember(app, orgId, 'approver');

    // Sorumlu kuruluş bilgilerini düzenler ve kullanıcıları görür ama ekleyemez.
    await request(server).patch('/api/v1/organizations/current').set(as(officer.accessToken)).send({ phone: '+90 212 000 00 00' }).expect(200);
    await request(server).get('/api/v1/members').set(as(officer.accessToken)).expect(200);
    for (const user of [admin, officer]) {
      await request(server)
        .post('/api/v1/members')
        .set(as(user.accessToken))
        .send({ email: uniqueEmail(), fullName: 'Ali Kaya', roleKey: 'approver' })
        .expect(404);
    }

    // Yönetici dokümanları ve envanteri görür, görev atamak için kullanıcıları listeler; kuruluş bilgilerini ve işlem
    // kayıtlarını yalnızca okur.
    for (const user of [approver]) {
      await request(server).get('/api/v1/documents').set(as(user.accessToken)).expect(200);
      await request(server).get('/api/v1/inventory').set(as(user.accessToken)).expect(200);
      await request(server).get('/api/v1/members').set(as(user.accessToken)).expect(200);
      await request(server).get('/api/v1/organizations/current').set(as(user.accessToken)).expect(200);
      await request(server).patch('/api/v1/organizations/current').set(as(user.accessToken)).send({ phone: '1' }).expect(403);
      await request(server).patch(`/api/v1/members/${approver.membershipId}`).set(as(user.accessToken)).send({ roleKey: 'officer_approver' }).expect(404);
      await request(server).get('/api/v1/audit-logs').set(as(user.accessToken)).expect(200);
      await request(server).post('/api/v1/documents/setup').set(as(user.accessToken)).expect(403);
    }

    // Devre dışı bırakılan üye erişemez.
    await app.get(MembersService).update(orgId, null, approver.membershipId, { status: 'disabled' });
    await request(server).get('/api/v1/documents').set(as(approver.accessToken)).expect(403);
  });

  it('firma logosunu Sorumlu yükler, kuruluşun her üyesi görür', async () => {
    const { admin, orgId, as } = await setupOrg();
    const approver = await addMember(app, orgId, 'approver');
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);

    await request(server).get('/api/v1/organizations/current/logo').set(as(admin.accessToken)).expect(404);
    await request(server)
      .put('/api/v1/organizations/current/logo')
      .set(as(admin.accessToken))
      .attach('file', Buffer.from('<svg/>'), { filename: 'logo.svg', contentType: 'image/svg+xml' })
      .expect(400);
    await request(server)
      .put('/api/v1/organizations/current/logo')
      .set(as(approver.accessToken))
      .attach('file', png, { filename: 'logo.png', contentType: 'image/png' })
      .expect(403);
    const set = await request(server)
      .put('/api/v1/organizations/current/logo')
      .set(as(admin.accessToken))
      .attach('file', png, { filename: 'logo.png', contentType: 'image/png' })
      .expect(200);
    expect(set.body.logoUpdatedAt).toEqual(expect.any(String));
    expect(set.body).not.toHaveProperty('logo');

    const me = await request(server).get('/api/v1/auth/me').set('Authorization', `Bearer ${approver.accessToken}`).expect(200);
    expect(me.body.organizations[0].logoUpdatedAt).toEqual(expect.any(String));
    const logo = await request(server).get('/api/v1/organizations/current/logo').set(as(approver.accessToken)).expect(200);
    expect(logo.headers['content-type']).toContain('image/png');

    await request(server).delete('/api/v1/organizations/current/logo').set(as(admin.accessToken)).expect(200);
    await request(server).get('/api/v1/organizations/current/logo').set(as(approver.accessToken)).expect(404);
  });

  it('kuruluşta Sorumlu ve Yönetici yetkisi olan birer aktif kişi kalır', async () => {
    const { admin, orgId, as } = await setupOrg();
    const members = app.get(MembersService);
    const own = (await request(server).get('/api/v1/members').set(as(admin.accessToken)).expect(200)).body.items[0];
    await expect(members.update(orgId, null, own.id, { roleKey: 'kvkk_officer' })).rejects.toThrow('en az bir aktif Yönetici');
    await expect(members.update(orgId, null, own.id, { roleKey: 'approver' })).rejects.toThrow('en az bir aktif KVKK Sorumlusu');
    await expect(members.remove(orgId, null, own.id)).rejects.toThrow();

    const approver = await addMember(app, orgId, 'approver');
    await members.update(orgId, null, own.id, { roleKey: 'kvkk_officer' });
    await expect(members.remove(orgId, null, approver.membershipId)).rejects.toThrow('en az bir aktif Yönetici');
    await expect(members.update(orgId, null, own.id, { roleKey: 'nope' })).rejects.toThrow('Rol bu kuruluşta tanımlı değil');
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

  it('ayrıntılı kaydı olmayan işlemleri de genel kayıtla loglar; oturum yenilemeyi loglamaz', async () => {
    const { admin, as } = await setupOrg();
    await request(server)
      .patch('/api/v1/organizations/current')
      .set(as(admin.accessToken))
      .set('user-agent', 'kvkk-test-tarayici')
      .send({ phone: '+90 312 222 22 22' })
      .expect(200);
    await request(server).post('/api/v1/notifications/read-all').set(as(admin.accessToken)).expect(204);
    await request(server).post('/api/v1/auth/refresh').send({ refreshToken: admin.refreshToken }).expect(200);

    const logs = await request(server).get('/api/v1/audit-logs').set(as(admin.accessToken)).expect(200);
    const updated = logs.body.items.find((l: any) => l.action === 'organization.updated');
    // Ayrıntılı kayıt, IP ve tarayıcı bilgisini istekten alır.
    expect(updated.ip).toBeTruthy();
    expect(updated.userAgent).toBe('kvkk-test-tarayici');
    const generic = logs.body.items.find((l: any) => l.action === 'notifications.readAll');
    expect(generic).toMatchObject({
      user: { email: admin.email },
      metadata: { method: 'POST', path: '/api/v1/notifications/read-all' },
    });
    expect(generic.ip).toBeTruthy();
    // Aynı istek için ikinci (genel) kayıt yazılmaz.
    expect(logs.body.items.filter((l: any) => l.action.startsWith('organizations.'))).toEqual([]);
    const refreshLogs = await app
      .get<Database>(DB)
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.userId, admin.user.id), eq(auditLogs.action, 'auth.refresh')));
    expect(refreshLogs).toEqual([]);
  });
});
