import { INestApplication } from '@nestjs/common';
import PizZip from 'pizzip';
import request from 'supertest';
import { createApp, extractCode, lastMailTo, login, registerAndLogin, uniqueEmail } from './helpers';

const PROFILE = {
  address: 'Atatürk Cad. No:1 Çankaya/Ankara',
  email: 'info@ornek.com.tr',
  phone: '+90 312 000 00 00',
  kepAddress: 'ornek@hs01.kep.tr',
  authorizedPerson: 'Ayşe Yılmaz',
  taxNumber: '1234567890',
  website: 'www.ornek.com.tr',
};

/** supertest'in .docx yanıtını Buffer olarak alması için. */
function binary(res: any, cb: (err: Error | null, body: Buffer) => void) {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
}

function docxText(file: Buffer, part = 'word/document.xml') {
  return new PizZip(file)
    .file(part)!
    .asText()
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ');
}

describe('Doküman Yönetimi', () => {
  let app: INestApplication;
  let server: any;

  beforeAll(async () => {
    app = await createApp();
    server = app.getHttpServer();
  });
  afterAll(() => app.close());

  async function setupOrg(profile: Record<string, string> = PROFILE) {
    const admin = await registerAndLogin(app);
    const res = await request(server)
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ name: 'Örnek Ticaret A.Ş.', ...profile })
      .expect(201);
    const orgId: string = res.body.id;
    const as = (token: string) => ({ Authorization: `Bearer ${token}`, 'X-Organization-Id': orgId });
    return { admin, orgId, as };
  }

  async function download(headers: Record<string, string>, docId: string, versionId: string, status = 200) {
    const res = await request(server)
      .get(`/api/v1/documents/${docId}/versions/${versionId}/file`)
      .set(headers)
      .buffer(true)
      .parse(binary)
      .expect(status);
    return res.body as Buffer;
  }

  async function addMember(admin: { accessToken: string }, as: (t: string) => any, roleKey: string) {
    const roles = await request(server).get('/api/v1/roles').set(as(admin.accessToken)).expect(200);
    const roleId = roles.body.items.find((r: any) => r.key === roleKey).id;
    const email = uniqueEmail(roleKey);
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

  it('şablon kataloğunu opsiyonel işaretleriyle listeler', async () => {
    const { admin, as } = await setupOrg();
    const res = await request(server).get('/api/v1/document-templates').set(as(admin.accessToken)).expect(200);
    expect(res.body.items).toHaveLength(15);
    const optional = res.body.items.filter((t: any) => t.optional).map((t: any) => t.code);
    expect(optional).toEqual(['AYM-030', 'AYM-040']);
    expect(res.body.items.every((t: any) => t.documentId === null)).toBe(true);
  });

  it('şablonu kuruluş bilgileriyle doldurur; başlık alanlarına dokunmaz', async () => {
    const { admin, as } = await setupOrg();
    const created = await request(server)
      .post('/api/v1/documents')
      .set(as(admin.accessToken))
      .send({ templateCode: 'AYM-010' })
      .expect(201);
    expect(created.body).toMatchObject({ code: 'AYM-010', category: 'notice', publishedVersionId: null });
    expect(created.body.versions).toHaveLength(1);
    expect(created.body.versions[0]).toMatchObject({ versionNo: 1, status: 'draft', source: 'template' });
    expect(created.body.versions[0].content).toBeUndefined();

    const file = await download(as(admin.accessToken), created.body.id, created.body.versions[0].id);
    const text = docxText(file);
    expect(text).toContain('Örnek Ticaret A.Ş.');
    expect(text).toContain(PROFILE.address);
    expect(text).toContain(PROFILE.taxNumber);
    expect(text).toContain(PROFILE.website);
    expect(text).not.toContain('{{');

    // Politikanın başlığındaki revizyon bilgisi şablondaki gibi kalır.
    const pol = await request(server)
      .post('/api/v1/documents')
      .set(as(admin.accessToken))
      .send({ templateCode: 'POL-010' })
      .expect(201);
    const polFile = await download(as(admin.accessToken), pol.body.id, pol.body.versions[0].id);
    const header = docxText(polFile, 'word/header1.xml');
    expect(header).toContain('Örnek Ticaret A.Ş.');
    expect(header).toContain('REVİZYON NO. 00');
    expect(header).not.toContain('{{');

    // Aynı şablondan ikinci doküman oluşturulamaz.
    await request(server)
      .post('/api/v1/documents')
      .set(as(admin.accessToken))
      .send({ templateCode: 'AYM-010' })
      .expect(409);
    await request(server)
      .post('/api/v1/documents')
      .set(as(admin.accessToken))
      .send({ templateCode: 'TBL-010' })
      .expect(400);
  });

  it('KEP adresi ve web sitesi boşsa doküman yine oluşturulur, yer tutucu boş kalır', async () => {
    const { kepAddress, website, ...rest } = PROFILE;
    const { admin, as } = await setupOrg(rest);
    const created = await request(server)
      .post('/api/v1/documents')
      .set(as(admin.accessToken))
      .send({ templateCode: 'AYM-010' })
      .expect(201);
    const text = docxText(await download(as(admin.accessToken), created.body.id, created.body.versions[0].id));
    expect(text).toContain(PROFILE.address);
    expect(text).not.toContain('{{');
    await request(server).post('/api/v1/documents/setup').set(as(admin.accessToken)).expect(201);
  });

  it('kuruluş bilgileri eksikse dokümanı oluşturmaz ve eksik alanları söyler', async () => {
    const { admin, as } = await setupOrg({});
    const res = await request(server)
      .post('/api/v1/documents')
      .set(as(admin.accessToken))
      .send({ templateCode: 'AYM-010' })
      .expect(400);
    expect(res.body.missing).toEqual(['address', 'taxNumber']);

    // Yalnızca ünvan kullanan şablon oluşturulabilir.
    await request(server)
      .post('/api/v1/documents')
      .set(as(admin.accessToken))
      .send({ templateCode: 'POL-010' })
      .expect(201);

    const setup = await request(server).post('/api/v1/documents/setup').set(as(admin.accessToken)).expect(400);
    expect(setup.body.missing).toEqual(['address', 'taxNumber']);
    const list = await request(server).get('/api/v1/documents').set(as(admin.accessToken)).expect(200);
    expect(list.body.items).toHaveLength(1);
  });

  it('kurulumda opsiyonel olmayan tüm dokümanları oluşturur', async () => {
    const { admin, as } = await setupOrg();
    await request(server)
      .post('/api/v1/documents')
      .set(as(admin.accessToken))
      .send({ templateCode: 'POL-010' })
      .expect(201);
    const res = await request(server).post('/api/v1/documents/setup').set(as(admin.accessToken)).expect(201);
    expect(res.body.created).toHaveLength(12);
    expect(res.body.skipped).toEqual(['POL-010']);
    const codes = res.body.created.map((d: any) => d.code);
    expect(codes).not.toContain('AYM-030');
    expect(codes).not.toContain('AYM-040');

    // Logo henüz desteklenmiyor: tabela metni oluşur, logo boş kaldığı not edilir.
    const list = await request(server).get('/api/v1/documents').set(as(admin.accessToken)).expect(200);
    expect(list.body.items).toHaveLength(13);
    const sign = list.body.items.find((d: any) => d.code === 'AYM-041');
    expect(sign.latestVersion.unfilledPlaceholders).toEqual(['kurum.logo']);

    // Opsiyonel şablon istenirse ayrıca oluşturulur.
    await request(server)
      .post('/api/v1/documents')
      .set(as(admin.accessToken))
      .send({ templateCode: 'AYM-040' })
      .expect(201);
    const again = await request(server).post('/api/v1/documents/setup').set(as(admin.accessToken)).expect(201);
    expect(again.body.created).toEqual([]);
    const catalog = await request(server).get('/api/v1/document-templates').set(as(admin.accessToken)).expect(200);
    const unused = catalog.body.items.filter((t: any) => !t.documentId).map((t: any) => t.code);
    expect(unused).toEqual(['AYM-030']);
  });

  it('sürümleri yönetir: yeniden oluşturma, yükleme ve yayınlama', async () => {
    const { admin, as } = await setupOrg();
    const doc = await request(server)
      .post('/api/v1/documents')
      .set(as(admin.accessToken))
      .send({ templateCode: 'SZL-010' })
      .expect(201);
    const id = doc.body.id;
    const v1 = doc.body.versions[0];

    const published = await request(server)
      .post(`/api/v1/documents/${id}/versions/${v1.id}/publish`)
      .set(as(admin.accessToken))
      .expect(200);
    expect(published.body.publishedVersionId).toBe(v1.id);
    expect(published.body.versions[0]).toMatchObject({ status: 'published' });
    expect(published.body.versions[0].publishedAt).toBeTruthy();
    await request(server)
      .post(`/api/v1/documents/${id}/versions/${v1.id}/publish`)
      .set(as(admin.accessToken))
      .expect(409);

    // Adres değişince şablon yeniden doldurulur ve yeni taslak sürüm olur.
    await request(server)
      .patch('/api/v1/organizations/current')
      .set(as(admin.accessToken))
      .send({ address: 'Yeni Adres Sok. No:5 İstanbul' })
      .expect(200);
    const v2 = await request(server)
      .post(`/api/v1/documents/${id}/regenerate`)
      .set(as(admin.accessToken))
      .send({ note: 'Adres güncellendi' })
      .expect(201);
    expect(v2.body).toMatchObject({ versionNo: 2, status: 'draft', source: 'template', note: 'Adres güncellendi' });
    expect(docxText(await download(as(admin.accessToken), id, v2.body.id))).toContain('Yeni Adres Sok. No:5 İstanbul');
    expect(docxText(await download(as(admin.accessToken), id, v1.id))).toContain(PROFILE.address);

    // Kullanıcı Word'de düzenleyip yükler.
    const edited = await download(as(admin.accessToken), id, v2.body.id);
    const v3 = await request(server)
      .post(`/api/v1/documents/${id}/versions`)
      .set(as(admin.accessToken))
      .field('note', 'İmza alanı düzenlendi')
      .attach('file', edited, 'duzenlenmis.docx')
      .expect(201);
    expect(v3.body).toMatchObject({ versionNo: 3, status: 'draft', source: 'upload' });
    expect(Buffer.compare(await download(as(admin.accessToken), id, v3.body.id), edited)).toBe(0);
    await request(server)
      .post(`/api/v1/documents/${id}/versions`)
      .set(as(admin.accessToken))
      .attach('file', Buffer.from('word dosyası değil'), 'sahte.docx')
      .expect(400);
    await request(server).post(`/api/v1/documents/${id}/versions`).set(as(admin.accessToken)).expect(400);

    // v3 yayınlanınca v1 yürürlükten kalkar; artık v2 yayınlanamaz.
    await request(server)
      .post(`/api/v1/documents/${id}/versions/${v3.body.id}/publish`)
      .set(as(admin.accessToken))
      .expect(200);
    await request(server)
      .post(`/api/v1/documents/${id}/versions/${v2.body.id}/publish`)
      .set(as(admin.accessToken))
      .expect(409);
    const detail = await request(server).get(`/api/v1/documents/${id}`).set(as(admin.accessToken)).expect(200);
    expect(detail.body.publishedVersionId).toBe(v3.body.id);
    expect(detail.body.versions.map((v: any) => [v.versionNo, v.status])).toEqual([
      [3, 'published'],
      [2, 'draft'],
      [1, 'superseded'],
    ]);

    const logs = await request(server).get('/api/v1/audit-logs').set(as(admin.accessToken)).expect(200);
    expect(logs.body.items.map((l: any) => l.action)).toEqual(
      expect.arrayContaining(['document.created', 'document.version_added', 'document.published']),
    );
  });

  it('görüntüleyici yalnızca yayındaki sürümü görür; yayınlama yetki ister', async () => {
    const { admin, as } = await setupOrg();
    const viewer = await addMember(admin, as, 'viewer');
    const draftDoc = await request(server)
      .post('/api/v1/documents')
      .set(as(admin.accessToken))
      .send({ templateCode: 'PRS-010' })
      .expect(201);
    const doc = await request(server)
      .post('/api/v1/documents')
      .set(as(admin.accessToken))
      .send({ templateCode: 'PRS-020' })
      .expect(201);
    const v1 = doc.body.versions[0];

    await request(server)
      .post(`/api/v1/documents/${doc.body.id}/versions/${v1.id}/publish`)
      .set(as(viewer.accessToken))
      .expect(403);
    await request(server).post('/api/v1/documents/setup').set(as(viewer.accessToken)).expect(403);
    await request(server)
      .post(`/api/v1/documents/${doc.body.id}/versions/${v1.id}/publish`)
      .set(as(admin.accessToken))
      .expect(200);
    const v2 = await request(server)
      .post(`/api/v1/documents/${doc.body.id}/regenerate`)
      .set(as(admin.accessToken))
      .expect(201);

    const list = await request(server).get('/api/v1/documents').set(as(viewer.accessToken)).expect(200);
    expect(list.body.items.map((d: any) => d.code)).toEqual(['PRS-020']);
    const detail = await request(server).get(`/api/v1/documents/${doc.body.id}`).set(as(viewer.accessToken)).expect(200);
    expect(detail.body.versions.map((v: any) => v.id)).toEqual([v1.id]);
    await request(server).get(`/api/v1/documents/${draftDoc.body.id}`).set(as(viewer.accessToken)).expect(404);
    await download(as(viewer.accessToken), doc.body.id, v1.id);
    await download(as(viewer.accessToken), doc.body.id, v2.body.id, 404);
  });

  it('başka kuruluşun dokümanına erişilemez', async () => {
    const a = await setupOrg();
    const b = await setupOrg();
    const doc = await request(server)
      .post('/api/v1/documents')
      .set(a.as(a.admin.accessToken))
      .send({ templateCode: 'FRM-020' })
      .expect(201);
    await request(server).get(`/api/v1/documents/${doc.body.id}`).set(b.as(b.admin.accessToken)).expect(404);
    await download(b.as(b.admin.accessToken), doc.body.id, doc.body.versions[0].id, 404);
    await request(server)
      .post(`/api/v1/documents/${doc.body.id}/versions/${doc.body.versions[0].id}/publish`)
      .set(b.as(b.admin.accessToken))
      .expect(404);
  });
});
