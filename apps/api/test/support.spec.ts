import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { addMember, createApp, createOrg, extractCode, lastMailTo, login, makePlatformAdmin, registerAndLogin, uniqueEmail } from './helpers';

/** 1x1 PNG. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

function binary(res: any, cb: (err: Error | null, body: Buffer) => void) {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
}

describe('Destek talepleri', () => {
  let app: INestApplication;
  let server: any;

  beforeAll(async () => {
    app = await createApp();
    server = app.getHttpServer();
  });
  afterAll(() => app.close());

  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function setup() {
    const staff = await registerAndLogin(app, uniqueEmail('destek'));
    await makePlatformAdmin(app, staff.user.id);
    const owner = await registerAndLogin(app);
    const orgId = await createOrg(app, owner, { name: 'Destek Deneme A.Ş.' });
    const as = (token: string) => ({ ...bearer(token), 'X-Organization-Id': orgId });

    // Yönetici rolünde ikinci kullanıcı (kendi taleplerini görür).
    const member = await addMember(app, orgId, 'approver', 'Zeynep Çalışan');
    return { staff, owner, member, orgId, as };
  }

  it('talep açılır, destek ekibi yanıtlar, kullanıcı yanıtlar ve talep kapanır', async () => {
    const { staff, owner, member, orgId, as } = await setup();

    const created = await request(server)
      .post('/api/v1/support/tickets')
      .set(as(member.accessToken))
      .field('subject', 'Envanter içe aktarma hatası')
      .field('category', 'technical')
      .field('body', 'Excel dosyasını yüklerken hata alıyorum.')
      .attach('files', PNG, 'ekran görüntüsü.png')
      .expect(201);
    const t = created.body;
    expect(t).toMatchObject({ status: 'open', category: 'technical', organizationId: orgId, assigneeId: null });
    expect(t.number).toBeGreaterThanOrEqual(1001);
    expect(t.messages).toHaveLength(1);
    expect(t.messages[0].attachments[0]).toMatchObject({ fileName: 'ekran görüntüsü.png', mimeType: 'image/png' });

    // Sorumlu yokken tüm platform yöneticilerine e-posta gider; yazışmanın içeriği e-postada yer almaz.
    const newMail = lastMailTo(app, staff.email);
    expect(newMail.subject).toBe(`Yeni destek talebi #${t.number}`);
    expect(newMail.text).toContain(`/admin/destek/${t.id}`);
    expect(newMail.text).not.toContain('Excel dosyasını');

    // Kullanıcı kendi talebini görür; aynı kuruluştaki başka bir kullanıcı (yönetici değilse) göremez.
    const mine = await request(server).get('/api/v1/support/tickets').set(as(member.accessToken)).expect(200);
    expect(mine.body.items.map((x: any) => x.id)).toEqual([t.id]);
    const ownerList = await request(server).get('/api/v1/support/tickets').set(as(owner.accessToken)).expect(200);
    expect(ownerList.body.items.map((x: any) => x.id)).toEqual([t.id]);

    // Ek: kullanıcı ve platform yöneticisi indirebilir, başkası indiremez.
    const attachmentId = t.messages[0].attachments[0].id;
    const file = await request(server)
      .get(`/api/v1/support/attachments/${attachmentId}`)
      .set(bearer(member.accessToken))
      .buffer(true)
      .parse(binary)
      .expect(200);
    expect(Buffer.compare(file.body, PNG)).toBe(0);
    expect(file.headers['content-type']).toBe('image/png');
    await request(server).get(`/api/v1/support/attachments/${attachmentId}`).set(bearer(staff.accessToken)).expect(200);
    const stranger = await registerAndLogin(app);
    await request(server).get(`/api/v1/support/attachments/${attachmentId}`).set(bearer(stranger.accessToken)).expect(404);
    await request(server).get(`/api/v1/support/tickets/${t.id}`).set(bearer(stranger.accessToken)).expect(404);

    // Destek ekibi kutusu.
    const inbox = await request(server)
      .get('/api/v1/admin/support/tickets')
      .query({ status: 'open', assignee: 'none', q: `#${t.number}` })
      .set(bearer(staff.accessToken))
      .expect(200);
    expect(inbox.body.items).toHaveLength(1);
    expect(inbox.body.items[0]).toMatchObject({ organizationName: 'Destek Deneme A.Ş.', createdByName: 'Zeynep Çalışan' });
    await request(server).get('/api/v1/admin/support/tickets').set(bearer(member.accessToken)).expect(403);

    const answered = await request(server)
      .post(`/api/v1/admin/support/tickets/${t.id}/messages`)
      .set(bearer(staff.accessToken))
      .field('body', 'Dosyanızdaki 3. satırda kategori boş görünüyor.')
      .expect(201);
    expect(answered.body).toMatchObject({ status: 'answered', assigneeId: staff.user.id });
    expect(answered.body.firstResponseAt).not.toBeNull();
    expect(answered.body.messages[1]).toMatchObject({ isStaff: true });
    const replyMail = lastMailTo(app, member.email);
    expect(replyMail.subject).toBe(`Destek talebiniz yanıtlandı #${t.number}`);
    expect(replyMail.text).toContain(`/destek/${t.id}`);

    // Kullanıcının yanıtı talebi tekrar destek ekibine düşürür; e-posta artık yalnızca sorumluya gider.
    const back = await request(server)
      .post(`/api/v1/support/tickets/${t.id}/messages`)
      .set(bearer(member.accessToken))
      .field('body', 'Düzelttim, teşekkürler.')
      .expect(201);
    expect(back.body.status).toBe('open');
    expect(lastMailTo(app, staff.email).subject).toBe(`Destek talebine yanıt geldi #${t.number}`);

    const closed = await request(server).post(`/api/v1/support/tickets/${t.id}/close`).set(bearer(member.accessToken)).expect(200);
    expect(closed.body.status).toBe('closed');
    expect(closed.body.closedAt).not.toBeNull();

    // Kapalı talebe yazmak talebi yeniden açar.
    const reopened = await request(server)
      .post(`/api/v1/support/tickets/${t.id}/messages`)
      .set(bearer(member.accessToken))
      .field('body', 'Aynı hata tekrar oluştu.')
      .expect(201);
    expect(reopened.body).toMatchObject({ status: 'open', closedAt: null });

    // Yönetici kapatınca kullanıcıya e-posta gider.
    await request(server)
      .patch(`/api/v1/admin/support/tickets/${t.id}`)
      .set(bearer(staff.accessToken))
      .send({ status: 'closed' })
      .expect(200);
    expect(lastMailTo(app, member.email).subject).toBe(`Destek talebiniz kapatıldı #${t.number}`);

    const audit = await request(server).get('/api/v1/audit-logs').set(as(owner.accessToken)).expect(200);
    expect(audit.body.items.map((a: any) => a.action)).toEqual(
      expect.arrayContaining(['support.ticket_created', 'support.ticket_assigned', 'support.ticket_status_changed']),
    );
  });

  it('sorumlu atanır; yalnızca platform yöneticisi sorumlu olabilir', async () => {
    const { staff, owner, member, as } = await setup();
    const other = await registerAndLogin(app, uniqueEmail('destek2'));
    await makePlatformAdmin(app, other.user.id);

    const t = (
      await request(server)
        .post('/api/v1/support/tickets')
        .set(as(owner.accessToken))
        .field('subject', 'Lisans süresi')
        .field('category', 'account')
        .field('body', 'Lisansımız ne zaman bitiyor?')
        .expect(201)
    ).body;

    await request(server)
      .patch(`/api/v1/admin/support/tickets/${t.id}`)
      .set(bearer(staff.accessToken))
      .send({ assigneeId: member.user.id })
      .expect(400);

    const assigned = await request(server)
      .patch(`/api/v1/admin/support/tickets/${t.id}`)
      .set(bearer(staff.accessToken))
      .send({ assigneeId: other.user.id })
      .expect(200);
    expect(assigned.body).toMatchObject({ assigneeId: other.user.id, assigneeName: 'Test Kullanıcı' });
    expect(lastMailTo(app, other.email).subject).toBe(`Destek talebi size atandı #${t.number}`);

    const mine = await request(server)
      .get('/api/v1/admin/support/tickets')
      .query({ assignee: 'me' })
      .set(bearer(other.accessToken))
      .expect(200);
    expect(mine.body.items.map((x: any) => x.id)).toContain(t.id);

    const summary = await request(server).get('/api/v1/admin/support/summary').set(bearer(other.accessToken)).expect(200);
    expect(summary.body.mine).toBeGreaterThanOrEqual(1);

    const staffList = await request(server).get('/api/v1/admin/support/staff').set(bearer(staff.accessToken)).expect(200);
    expect(staffList.body.items.map((s: any) => s.id)).toEqual(expect.arrayContaining([staff.user.id, other.user.id]));
  });

  it('geçersiz ekleri ve eksik alanları reddeder', async () => {
    const { member, as } = await setup();
    await request(server)
      .post('/api/v1/support/tickets')
      .set(as(member.accessToken))
      .field('subject', 'Deneme')
      .field('category', 'other')
      .field('body', 'Ekte sayfa var')
      .attach('files', Buffer.from('<html><script>alert(1)</script></html>'), 'resim.png')
      .expect(400)
      .expect((r) => expect(r.body.message).toContain('yalnızca PNG'));

    await request(server)
      .post('/api/v1/support/tickets')
      .set(as(member.accessToken))
      .send({ subject: 'Deneme', category: 'olmayan', body: 'x' })
      .expect(400);

    // Kuruluş başlığı olmadan talep açılamaz.
    await request(server)
      .post('/api/v1/support/tickets')
      .set(bearer(member.accessToken))
      .send({ subject: 'Deneme', category: 'other', body: 'x' })
      .expect(400);
  });
});
