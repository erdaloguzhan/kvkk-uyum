import { INestApplication } from '@nestjs/common';
import PizZip from 'pizzip';
import { DOCUMENT_TEMPLATES } from '@kvkk/shared';
import request from 'supertest';
import { addMember, createApp, createOrg, extractCode, lastMailTo, login, registerAndLogin, uniqueEmail } from './helpers';

const CATALOG_CODES = DOCUMENT_TEMPLATES.map((t) => t.code);

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
    const orgId = await createOrg(app, admin, { name: 'Örnek Ticaret A.Ş.', ...profile });
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


  it('şablon kataloğunu opsiyonel işaretleriyle listeler', async () => {
    const { admin, as } = await setupOrg();
    const res = await request(server).get('/api/v1/document-templates').set(as(admin.accessToken)).expect(200);
    // Diğer testlerde platform yöneticisinin eklediği şablonlar hariç.
    res.body.items = res.body.items.filter((t: any) => CATALOG_CODES.includes(t.code));
    expect(res.body.items).toHaveLength(24);
    const optional = res.body.items.filter((t: any) => t.optional).map((t: any) => t.code);
    expect(optional).toEqual(['AYM-030', 'AYM-040', 'AYM-060', 'AYM-070', 'FRM-060']);
    expect(res.body.items.every((t: any) => t.documentId === null)).toBe(true);
  });

  it('katalogda çıkarılan dokümanların şablonunu işaretler (yeni şablonlar kartında önerilmez)', async () => {
    const { admin, as } = await setupOrg();
    const create = (templateCode: string) =>
      request(server).post('/api/v1/documents').set(as(admin.accessToken)).send({ templateCode }).expect(201);
    const pol = await create('POL-010');
    const aym = await create('AYM-010');
    await request(server).post(`/api/v1/documents/${aym.body.id}/remove`).set(as(admin.accessToken)).send({}).expect(200);

    const res = await request(server).get('/api/v1/document-templates').set(as(admin.accessToken)).expect(200);
    const byCode = (code: string) => res.body.items.find((t: any) => t.code === code);
    expect(byCode('POL-010')).toMatchObject({ documentId: pol.body.id, removed: false });
    expect(byCode('AYM-010')).toMatchObject({ documentId: null, removed: true });
    expect(byCode('POL-030')).toMatchObject({ documentId: null, removed: false });

    // Çıkarılan şablondan yeniden oluşturulursa tekrar listede sayılır.
    const again = await create('AYM-010');
    const after = await request(server).get('/api/v1/document-templates').set(as(admin.accessToken)).expect(200);
    expect(after.body.items.find((t: any) => t.code === 'AYM-010')).toMatchObject({ documentId: again.body.id, removed: false });
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
    // Başlık, Word'ün kaydettiği biçime göre header1/2/3 dosyalarından birinde olabilir.
    const header = Object.keys(new PizZip(polFile).files)
      .filter((n) => /^word\/header\d+\.xml$/.test(n))
      .map((n) => docxText(polFile, n))
      .join(' ');
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
      .expect(404);
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
    expect(res.body.missing).toEqual(['address', 'email', 'taxNumber']);

    // Yalnızca ünvan kullanan şablon oluşturulabilir.
    await request(server)
      .post('/api/v1/documents')
      .set(as(admin.accessToken))
      .send({ templateCode: 'POL-010' })
      .expect(201);

    const setup = await request(server).post('/api/v1/documents/setup').set(as(admin.accessToken)).expect(400);
    expect(setup.body.missing).toEqual(['address', 'email', 'phone', 'taxNumber']);
    const list = await request(server).get('/api/v1/documents').set(as(admin.accessToken)).expect(200);
    expect(list.body.items).toHaveLength(1);
  });

  it('kurulumda opsiyoneller dahil tüm şablonlardan doküman oluşturur', async () => {
    const { admin, as } = await setupOrg();
    await request(server)
      .post('/api/v1/documents')
      .set(as(admin.accessToken))
      .send({ templateCode: 'POL-010' })
      .expect(201);
    const res = await request(server).post('/api/v1/documents/setup').set(as(admin.accessToken)).expect(201);
    const codes = res.body.created.map((d: any) => d.code);
    expect(codes.filter((c: string) => CATALOG_CODES.includes(c))).toHaveLength(23);
    expect(codes).toContain('AYM-030');
    expect(codes).toContain('AYM-040');
    expect(res.body.skipped).toEqual(['POL-010']);

    // Logo henüz desteklenmiyor: tabela metni oluşur, logo boş kaldığı not edilir.
    const list = await request(server).get('/api/v1/documents').set(as(admin.accessToken)).expect(200);
    expect(list.body.items.filter((d: any) => CATALOG_CODES.includes(d.code))).toHaveLength(24);
    const sign = list.body.items.find((d: any) => d.code === 'AYM-041');
    expect(sign.latestVersion.unfilledPlaceholders).toEqual(['kurum.logo']);

    const again = await request(server).post('/api/v1/documents/setup').set(as(admin.accessToken)).expect(201);
    expect(again.body.created).toEqual([]);
    const catalog = await request(server).get('/api/v1/document-templates').set(as(admin.accessToken)).expect(200);
    expect(catalog.body.items.filter((t: any) => !t.documentId && CATALOG_CODES.includes(t.code))).toEqual([]);
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

  it('Sorumlu yayınlayamaz; Yönetici taslağı görüp yayınlar ama düzenleyemez', async () => {
    const { admin, as, orgId } = await setupOrg();
    const officer = await addMember(app, orgId, 'kvkk_officer');
    const approver = await addMember(app, orgId, 'approver');
    await request(server)
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

    await request(server).post('/api/v1/documents/setup').set(as(approver.accessToken)).expect(403);
    // Sorumlu doğrudan yayınlayamaz, onaya gönderir. Yönetici taslağı görür ama düzenleyemez.
    await request(server)
      .post(`/api/v1/documents/${doc.body.id}/versions/${v1.id}/publish`)
      .set(as(officer.accessToken))
      .expect(403);
    const approverList = await request(server).get('/api/v1/documents').set(as(approver.accessToken)).expect(200);
    expect(approverList.body.items.map((d: any) => d.code).sort()).toEqual(['PRS-010', 'PRS-020']);
    await download(as(approver.accessToken), doc.body.id, v1.id);
    await request(server).post(`/api/v1/documents/${doc.body.id}/regenerate`).set(as(approver.accessToken)).expect(403);
    await request(server)
      .post(`/api/v1/documents/${doc.body.id}/versions/${v1.id}/publish`)
      .set(as(approver.accessToken))
      .expect(200);
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

  /** Geçerli, küçük bir Word dosyası: şablondan üretilmiş bir sürümün içeriği. */
  async function sampleDocx(headers: Record<string, string>) {
    const doc = await request(server).post('/api/v1/documents').set(headers).send({ templateCode: 'FRM-010' }).expect(201);
    return download(headers, doc.body.id, doc.body.versions[0].id);
  }

  async function addOwn(headers: Record<string, string>, fields: Record<string, string>, file: Buffer, status = 201) {
    let req = request(server).post('/api/v1/documents/own').set(headers);
    for (const [k, v] of Object.entries(fields)) req = req.field(k, v);
    return req.attach('file', file, 'kendi.docx').expect(status);
  }

  it('Sorumlu kendi dokümanını ekler; Yönetici onaylayınca yayına girer', async () => {
    const { admin, as, orgId } = await setupOrg();
    const officer = await addMember(app, orgId, 'kvkk_officer');
    const approver = await addMember(app, orgId, 'approver');
    const file = await sampleDocx(as(admin.accessToken));

    // Yönetici doküman ekleyemez; Word olmayan dosya reddedilir.
    await addOwn(as(approver.accessToken), { title: 'Kamera politikası', category: 'policy' }, file, 403);
    await addOwn(as(officer.accessToken), { title: 'Kamera politikası', category: 'policy' }, Buffer.from('düz metin'), 400);

    const own = await addOwn(as(officer.accessToken), { title: 'Kamera politikası', category: 'policy', note: 'İlk taslak' }, file);
    expect(own.body).toMatchObject({ code: 'KD-001', title: 'Kamera politikası', templateCode: null, publishedVersionId: null });
    expect(own.body.versions).toHaveLength(1);
    expect(own.body.versions[0]).toMatchObject({ status: 'draft', source: 'upload', note: 'İlk taslak' });
    const second = await addOwn(as(officer.accessToken), { title: 'Ziyaretçi formu', category: 'form' }, file);
    expect(second.body.code).toBe('KD-002');
    await addOwn(as(officer.accessToken), { code: 'KD-001', title: 'Aynı kod', category: 'form' }, file, 409);
    const coded = await addOwn(as(officer.accessToken), { code: 'PRS-900', title: 'Kendi prosedürü', category: 'procedure' }, file);
    expect(coded.body.code).toBe('PRS-900');

    // Sorumlu yayınlayamaz, onaya gönderir; Yönetici onaylayınca yayınlanır.
    const v1 = own.body.versions[0];
    await request(server).post(`/api/v1/documents/${own.body.id}/versions/${v1.id}/publish`).set(as(officer.accessToken)).expect(403);
    const req = await request(server)
      .post(`/api/v1/documents/${own.body.id}/versions/${v1.id}/approval-requests`)
      .set(as(officer.accessToken))
      .send({ approverId: approver.user.id })
      .expect(201);
    expect(req.body.kind).toBe('publish');
    await request(server).post(`/api/v1/approval-requests/${req.body.id}/approve`).set(as(approver.accessToken)).send({}).expect(200);
    const after = await request(server).get(`/api/v1/documents/${own.body.id}`).set(as(officer.accessToken)).expect(200);
    expect(after.body.publishedVersionId).toBe(v1.id);
  });

  it('doküman Yönetici onayıyla listeden çıkarılır; kayıt silinmez, bağlı talep ve görevler iptal olur', async () => {
    const { admin, as, orgId } = await setupOrg();
    const officer = await addMember(app, orgId, 'kvkk_officer');
    const approver = await addMember(app, orgId, 'approver');
    const doc = await request(server).post('/api/v1/documents').set(as(admin.accessToken)).send({ templateCode: 'AYM-030' }).expect(201);
    const keep = await request(server).post('/api/v1/documents').set(as(admin.accessToken)).send({ templateCode: 'AYM-040' }).expect(201);
    // Bekleyen yayın talebi ve gözden geçirme görevi, doküman çıkarılınca iptal edilmeli.
    const publishReq = await request(server)
      .post(`/api/v1/documents/${doc.body.id}/versions/${doc.body.versions[0].id}/approval-requests`)
      .set(as(officer.accessToken))
      .send({ approverId: approver.user.id })
      .expect(201);
    const review = await request(server)
      .post('/api/v1/tasks')
      .set(as(admin.accessToken))
      .send({
        type: 'document_review',
        title: 'AYM-030 gözden geçirme',
        assigneeId: officer.user.id,
        dueDate: '2030-01-01',
        entityType: 'document',
        entityId: doc.body.id,
      })
      .expect(201);

    // Sorumlu doğrudan çıkaramaz; Yönetici çıkarma talebi açamaz.
    await request(server).post(`/api/v1/documents/${doc.body.id}/remove`).set(as(officer.accessToken)).send({}).expect(403);
    await request(server)
      .post(`/api/v1/documents/${doc.body.id}/removal-requests`)
      .set(as(approver.accessToken))
      .send({ approverId: approver.user.id })
      .expect(403);
    // Onaylayıcı doküman onay yetkisine sahip olmalı.
    await request(server)
      .post(`/api/v1/documents/${doc.body.id}/removal-requests`)
      .set(as(officer.accessToken))
      .send({ approverId: officer.user.id })
      .expect(400);

    const removal = await request(server)
      .post(`/api/v1/documents/${doc.body.id}/removal-requests`)
      .set(as(officer.accessToken))
      .send({ approverId: approver.user.id, note: 'Kuruluşta kamera yok' })
      .expect(201);
    expect(removal.body).toMatchObject({ kind: 'remove', status: 'pending', version: null });
    await request(server)
      .post(`/api/v1/documents/${doc.body.id}/removal-requests`)
      .set(as(officer.accessToken))
      .send({ approverId: approver.user.id })
      .expect(409);
    const notice = await request(server).get('/api/v1/notifications').set(as(approver.accessToken)).expect(200);
    expect(notice.body.items[0].body).toContain('listeden çıkarılması için onayınız isteniyor');

    // Onaya kadar doküman listede kalır, bekleyen çıkarma talebi görünür.
    let list = await request(server).get('/api/v1/documents').set(as(officer.accessToken)).expect(200);
    const pending = list.body.items.find((d: any) => d.id === doc.body.id);
    expect(pending.pendingRemoval).toMatchObject({ id: removal.body.id, approver: { id: approver.user.id } });
    const tasksOfApprover = await request(server).get('/api/v1/tasks').set(as(approver.accessToken)).query({ status: 'open' }).expect(200);
    expect(tasksOfApprover.body.items.map((t: any) => t.title)).toContain(`Çıkarma onayı: AYM-030 ${doc.body.title}`);

    // Ret: doküman yerinde kalır, Sorumlu yeniden talep edebilir.
    await request(server)
      .post(`/api/v1/approval-requests/${removal.body.id}/reject`)
      .set(as(approver.accessToken))
      .send({ note: 'Şimdilik kalsın' })
      .expect(200);
    list = await request(server).get('/api/v1/documents').set(as(officer.accessToken)).expect(200);
    expect(list.body.items.find((d: any) => d.id === doc.body.id).pendingRemoval).toBeNull();
    const removal2 = await request(server)
      .post(`/api/v1/documents/${doc.body.id}/removal-requests`)
      .set(as(officer.accessToken))
      .send({ approverId: approver.user.id })
      .expect(201);

    // Onay: doküman listeden çıkar; bağlı talepler ve görevler iptal olur.
    const approved = await request(server)
      .post(`/api/v1/approval-requests/${removal2.body.id}/approve`)
      .set(as(approver.accessToken))
      .send({})
      .expect(200);
    expect(approved.body.status).toBe('approved');
    list = await request(server).get('/api/v1/documents').set(as(officer.accessToken)).expect(200);
    expect(list.body.items.map((d: any) => d.id)).toEqual([keep.body.id]);
    await request(server).get(`/api/v1/documents/${doc.body.id}`).set(as(officer.accessToken)).expect(404);
    const pr = await request(server).get(`/api/v1/approval-requests/${publishReq.body.id}`).set(as(officer.accessToken)).expect(200);
    expect(pr.body.status).toBe('cancelled');
    const t = await request(server).get(`/api/v1/tasks/${review.body.id}`).set(as(admin.accessToken)).expect(200);
    expect(t.body.status).toBe('cancelled');
    const decided = await request(server).get('/api/v1/notifications').set(as(officer.accessToken)).expect(200);
    expect(decided.body.items[0].title).toContain('listeden çıkarıldı');

    // İşlem kaydı tutulur; şablon yeniden eklenebilir.
    const audit = await request(server).get('/api/v1/audit-logs').set(as(admin.accessToken)).query({ action: 'document.removed' }).expect(200);
    expect(audit.body.items.some((a: any) => a.entityId === doc.body.id)).toBe(true);
    const catalog = await request(server).get('/api/v1/document-templates').set(as(admin.accessToken)).expect(200);
    expect(catalog.body.items.find((x: any) => x.code === 'AYM-030').documentId).toBeNull();
    await request(server).post('/api/v1/documents').set(as(admin.accessToken)).send({ templateCode: 'AYM-030' }).expect(201);
  });

  it('düzenleme ve onay yetkisi olan kişi dokümanı doğrudan çıkarır', async () => {
    const { admin, as } = await setupOrg();
    const doc = await request(server).post('/api/v1/documents').set(as(admin.accessToken)).send({ templateCode: 'PRS-010' }).expect(201);
    const res = await request(server).post(`/api/v1/documents/${doc.body.id}/remove`).set(as(admin.accessToken)).send({}).expect(200);
    expect(res.body).toMatchObject({ id: doc.body.id, code: 'PRS-010' });
    await request(server).post(`/api/v1/documents/${doc.body.id}/remove`).set(as(admin.accessToken)).send({}).expect(404);
    const list = await request(server).get('/api/v1/documents').set(as(admin.accessToken)).expect(200);
    expect(list.body.items).toEqual([]);
  });
});
