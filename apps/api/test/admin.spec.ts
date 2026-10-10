import { INestApplication } from '@nestjs/common';
import { DOCUMENT_TEMPLATES, ORGANIZATION_PLACEHOLDERS } from '@kvkk/shared';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import PizZip from 'pizzip';
import request from 'supertest';
import { templateTags, UNSUPPORTED_PLACEHOLDERS } from '../src/documents/template-renderer';
import {
  createApp,
  createOrg,
  extractCode,
  lastMailTo,
  login,
  makePlatformAdmin,
  PASSWORD,
  registerAndLogin,
  uniqueEmail,
} from './helpers';

const CONTENT_DIR = path.resolve(__dirname, '../../../content');
const BASE_DOCX = readFileSync(path.join(CONTENT_DIR, 'formlar/FRM-010 Veri Sahibi Başvuru Formu.docx'));

const PROFILE = {
  name: 'Yeni Müşteri Ltd. Şti.',
  address: 'Cumhuriyet Cad. No:5 Konak/İzmir',
  phone: '+90 232 000 00 00',
  taxNumber: '9876543210',
};

/** Temel şablonun başına verilen metni paragraf olarak ekler. */
function docxWith(text: string) {
  const zip = new PizZip(BASE_DOCX);
  const xml = zip.file('word/document.xml')!.asText();
  const body = xml.indexOf('>', xml.indexOf('<w:body')) + 1;
  zip.file('word/document.xml', `${xml.slice(0, body)}<w:p><w:r><w:t>${text}</w:t></w:r></w:p>${xml.slice(body)}`);
  return zip.generate({ type: 'nodebuffer' }) as Buffer;
}

function docxText(file: Buffer) {
  return new PizZip(file)
    .file('word/document.xml')!
    .asText()
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ');
}

function binary(res: any, cb: (err: Error | null, body: Buffer) => void) {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
}

function randomCode() {
  const letters = Array.from({ length: 3 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join('');
  return `T${letters}-${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`;
}

/** Türkiye saatine göre bugünden `days` gün sonrası (YYYY-MM-DD). */
function dayFromToday(days: number) {
  const d = new Date(Date.now() + 3 * 3600_000 + days * 86_400_000);
  return d.toISOString().slice(0, 10);
}

describe('Yönetim paneli', () => {
  let app: INestApplication;
  let server: any;
  let admin: Awaited<ReturnType<typeof registerAndLogin>>;
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    app = await createApp();
    server = app.getHttpServer();
    admin = await registerAndLogin(app);
    await makePlatformAdmin(app, admin.user.id);
  });
  afterAll(() => app.close());

  it('yönetim paneli yalnızca platform yöneticilerine açık; müşteriler kuruluş açamaz', async () => {
    const user = await registerAndLogin(app);
    await request(server).get('/api/v1/admin/organizations').set(auth(user.accessToken)).expect(403);
    await request(server).get('/api/v1/admin/templates').set(auth(user.accessToken)).expect(403);
    await request(server)
      .post('/api/v1/organizations')
      .set(auth(user.accessToken))
      .send({ name: 'Kendi Kuruluşum' })
      .expect(404);

    const me = await request(server).get('/api/v1/auth/me').set(auth(admin.accessToken)).expect(200);
    expect(me.body.isPlatformAdmin).toBe(true);
    const userMe = await request(server).get('/api/v1/auth/me').set(auth(user.accessToken)).expect(200);
    expect(userMe.body.isPlatformAdmin).toBe(false);
  });

  describe('kuruluş ekleme', () => {
    it('kuruluşu açar, kayıttaki e-postaya şifre oluşturma bağlantısı gönderir; yetkili şifresini belirleyip yönetici olarak girer', async () => {
      const email = uniqueEmail('yetkili');
      const res = await request(server)
        .post('/api/v1/admin/organizations')
        .set(auth(admin.accessToken))
        .send({ ...PROFILE, email, authorizedPerson: 'Mehmet Demir' })
        .expect(201);
      expect(res.body.owner).toMatchObject({ email, newUser: true });
      // Zorunlu bilgiler girildiği için kurulum tamamlanmış sayılır.
      expect(res.body.organization.setupCompletedAt).toBeTruthy();

      const mail = lastMailTo(app, email);
      expect(mail.text).toContain('Merhaba Mehmet Demir');
      expect(mail.text).toContain(PROFILE.name);
      expect(mail.text).toMatch(/http:\/\/localhost:3000\/sifre-belirle\?kod=/);
      // Şifre e-postayla gönderilmez.
      expect(mail.text).not.toContain(PASSWORD);

      await request(server)
        .post('/api/v1/auth/password-reset/confirm')
        .send({ token: extractCode(mail.text), password: PASSWORD })
        .expect(204);
      const owner = await login(app, email);
      const me = await request(server).get('/api/v1/auth/me').set(auth(owner.accessToken)).expect(200);
      expect(me.body.fullName).toBe('Mehmet Demir');
      expect(me.body.organizations).toEqual([
        expect.objectContaining({ id: res.body.organization.id, role: expect.objectContaining({ key: 'org_admin' }) }),
      ]);

      // Platform yöneticisi kuruluşun üyesi olmaz.
      const adminMe = await request(server).get('/api/v1/auth/me').set(auth(admin.accessToken)).expect(200);
      expect(adminMe.body.organizations.map((o: any) => o.id)).not.toContain(res.body.organization.id);

      const list = await request(server).get('/api/v1/admin/organizations').set(auth(admin.accessToken)).expect(200);
      expect(list.body.items.find((o: any) => o.id === res.body.organization.id)).toMatchObject({
        name: PROFILE.name,
        email,
        memberCount: 1,
      });
    });

    it('e-posta ve yetkili kişi zorunlu', async () => {
      await request(server)
        .post('/api/v1/admin/organizations')
        .set(auth(admin.accessToken))
        .send({ ...PROFILE, authorizedPerson: 'Mehmet Demir' })
        .expect(400);
      await request(server)
        .post('/api/v1/admin/organizations')
        .set(auth(admin.accessToken))
        .send({ ...PROFILE, email: uniqueEmail() })
        .expect(400);
    });

    it('e-posta kayıtlı bir kullanıcıya aitse kuruluşa yönetici olarak eklenir ve bilgilendirilir', async () => {
      const existing = await registerAndLogin(app);
      const res = await request(server)
        .post('/api/v1/admin/organizations')
        .set(auth(admin.accessToken))
        .send({ name: 'İkinci Kuruluş A.Ş.', email: existing.email, authorizedPerson: 'Test Kullanıcı' })
        .expect(201);
      expect(res.body.owner.newUser).toBe(false);
      expect(res.body.organization.setupCompletedAt).toBeNull();
      const mail = lastMailTo(app, existing.email);
      expect(mail.text).toContain('İkinci Kuruluş A.Ş.');
      expect(mail.text).toContain('/giris');
      const me = await request(server).get('/api/v1/auth/me').set(auth(existing.accessToken)).expect(200);
      expect(me.body.organizations[0]).toMatchObject({ id: res.body.organization.id, role: { key: 'org_admin' } });
    });

    it('daveti yeniden gönderir; önceki bağlantı geçersiz olur', async () => {
      const email = uniqueEmail('yetkili');
      const res = await request(server)
        .post('/api/v1/admin/organizations')
        .set(auth(admin.accessToken))
        .send({ name: 'Üçüncü Kuruluş', email, authorizedPerson: 'Zeynep Kaya' })
        .expect(201);
      const first = extractCode(lastMailTo(app, email).text);
      await request(server)
        .post(`/api/v1/admin/organizations/${res.body.organization.id}/resend-invite`)
        .set(auth(admin.accessToken))
        .expect(200);
      const second = extractCode(lastMailTo(app, email).text);
      expect(second).not.toBe(first);
      await request(server)
        .post('/api/v1/auth/password-reset/confirm')
        .send({ token: first, password: PASSWORD })
        .expect(400);
      await request(server)
        .post('/api/v1/auth/password-reset/confirm')
        .send({ token: second, password: PASSWORD })
        .expect(204);
    });
  });

  describe('ana doküman şablonları', () => {
    it('katalogdaki tüm şablonlar ilk sürüm olarak yayında ve yalnızca tanınan alanları içeriyor', async () => {
      const res = await request(server).get('/api/v1/admin/templates').set(auth(admin.accessToken)).expect(200);
      for (const t of DOCUMENT_TEMPLATES) {
        const item = res.body.items.find((i: any) => i.code === t.code);
        expect(item).toMatchObject({ title: t.title, currentVersion: expect.objectContaining({ versionNo: 1 }) });
      }
      const allowed = [...Object.keys(ORGANIZATION_PLACEHOLDERS), ...UNSUPPORTED_PLACEHOLDERS];
      for (const t of DOCUMENT_TEMPLATES) {
        const tags = templateTags(readFileSync(path.join(CONTENT_DIR, t.file)));
        expect({ code: t.code, unknown: tags.filter((x) => !allowed.includes(x)) }).toEqual({ code: t.code, unknown: [] });
      }
    });

    it('hatalı dosyaları reddeder', async () => {
      const code = randomCode();
      const create = (file: Buffer) =>
        request(server)
          .post('/api/v1/admin/templates')
          .set(auth(admin.accessToken))
          .field('code', code)
          .field('title', 'Deneme')
          .field('category', 'form')
          .attach('file', file, 'deneme.docx');
      const notDocx = await create(Buffer.from('düz metin')).expect(400);
      expect(notDocx.body.message).toContain('Word');
      const unknown = await create(docxWith('{{kurum.bilinmeyen}}')).expect(400);
      expect(unknown.body.message).toContain('{{kurum.bilinmeyen}}');
      const broken = await create(docxWith('{{kurum.unvan')).expect(400);
      expect(broken.body.message).toContain('{{');
    });

    it('yayınlanan sürüm yayın tarihinden itibaren yeni dokümanlara gelir; eski dokümanlar kendiliğinden değişmez', async () => {
      const code = randomCode();
      const tpl = (p = '') => `/api/v1/admin/templates/${code}${p}`;

      // Yeni şablon taslak olarak eklenir; yayınlanana kadar müşterilere görünmez.
      const created = await request(server)
        .post('/api/v1/admin/templates')
        .set(auth(admin.accessToken))
        .field('code', code.toLowerCase())
        .field('title', 'Deneme Formu')
        .field('category', 'form')
        .field('optional', 'true')
        .attach('file', docxWith('BIRINCI SURUM {{kurum.unvan}}'), 'Deneme Formu.docx')
        .expect(201);
      expect(created.body).toMatchObject({ code, optional: true, versions: [{ versionNo: 1, state: 'draft' }] });

      const owner = await registerAndLogin(app);
      const orgId = await createOrg(app, owner, { ...PROFILE, email: 'info@musteri.com.tr', authorizedPerson: 'Ali Veli' });
      const as = { ...auth(owner.accessToken), 'X-Organization-Id': orgId };
      const catalog = async () =>
        (await request(server).get('/api/v1/document-templates').set(as).expect(200)).body.items.find(
          (t: any) => t.code === code,
        );
      expect(await catalog()).toBeUndefined();

      // v1 hemen yayınlanır, müşteri dokümanı oluşturur.
      await request(server)
        .post(tpl(`/versions/${created.body.versions[0].id}/publish`))
        .set(auth(admin.accessToken))
        .send({})
        .expect(200);
      expect(await catalog()).toMatchObject({ versionNo: 1, optional: true, documentId: null });
      const doc = await request(server).post('/api/v1/documents').set(as).send({ templateCode: code }).expect(201);

      // v2 taslak yüklenir: müşteride değişiklik yok.
      const v2 = await request(server)
        .post(tpl('/versions'))
        .set(auth(admin.accessToken))
        .field('note', 'Yeni mevzuat')
        .attach('file', docxWith('IKINCI SURUM {{kurum.unvan}}'), 'Deneme Formu v2.docx')
        .expect(201);
      expect(v2.body).toMatchObject({ versionNo: 2, status: 'draft', note: 'Yeni mevzuat' });
      const docState = async () => (await request(server).get(`/api/v1/documents/${doc.body.id}`).set(as).expect(200)).body;
      expect((await docState()).templateUpdate).toBeNull();

      // Geçmiş tarihle yayınlanamaz; ileri tarihle planlanır ve o güne kadar geçerli olmaz.
      await request(server)
        .post(tpl(`/versions/${v2.body.id}/publish`))
        .set(auth(admin.accessToken))
        .send({ effectiveDate: dayFromToday(-1) })
        .expect(400);
      const scheduled = await request(server)
        .post(tpl(`/versions/${v2.body.id}/publish`))
        .set(auth(admin.accessToken))
        .send({ effectiveDate: dayFromToday(10) })
        .expect(200);
      expect(scheduled.body.versions.map((v: any) => [v.versionNo, v.state])).toEqual([
        [2, 'scheduled'],
        [1, 'current'],
      ]);
      expect((await docState()).templateUpdate).toBeNull();
      expect(await catalog()).toMatchObject({ versionNo: 1 });

      // Planlanmış yayın iptal edilip hemen yayınlanır.
      await request(server).post(tpl(`/versions/${v2.body.id}/unpublish`)).set(auth(admin.accessToken)).expect(200);
      const published = await request(server)
        .post(tpl(`/versions/${v2.body.id}/publish`))
        .set(auth(admin.accessToken))
        .send({ effectiveDate: dayFromToday(0) })
        .expect(200);
      expect(published.body.versions.map((v: any) => [v.versionNo, v.state])).toEqual([
        [2, 'current'],
        [1, 'past'],
      ]);
      // Yayındaki sürüm iptal edilemez.
      await request(server).post(tpl(`/versions/${v2.body.id}/unpublish`)).set(auth(admin.accessToken)).expect(409);

      // Mevcut doküman değişmedi, "güncelleme mevcut" görünür.
      const before = await docState();
      expect(before.versions).toHaveLength(1);
      expect(before.templateUpdate).toMatchObject({ versionNo: 2 });
      const list = await request(server).get('/api/v1/documents').set(as).expect(200);
      expect(list.body.items.find((d: any) => d.id === doc.body.id).templateUpdate).toMatchObject({ versionNo: 2 });

      // Kullanıcı güncelleyince yeni taslak v2'den üretilir.
      const regenerated = await request(server)
        .post(`/api/v1/documents/${doc.body.id}/regenerate`)
        .set(as)
        .send({})
        .expect(201);
      const file = await request(server)
        .get(`/api/v1/documents/${doc.body.id}/versions/${regenerated.body.id}/file`)
        .set(as)
        .buffer(true)
        .parse(binary)
        .expect(200);
      expect(docxText(file.body)).toContain(`IKINCI SURUM ${PROFILE.name}`);
      expect((await docState()).templateUpdate).toBeNull();

      // Elle yüklenen sürüm de v2'ye dayanır sayılır.
      await request(server)
        .post(`/api/v1/documents/${doc.body.id}/versions`)
        .set(as)
        .attach('file', docxWith('ELLE DUZENLENDI'), 'duzenli.docx')
        .expect(201);
      expect((await docState()).templateUpdate).toBeNull();

      // Yayından sonra oluşturulan dokümanlar doğrudan yeni sürümden gelir.
      const other = await registerAndLogin(app);
      const otherOrg = await createOrg(app, other, { ...PROFILE, name: 'Diğer A.Ş.', email: 'a@b.com', authorizedPerson: 'X Y' });
      const otherAs = { ...auth(other.accessToken), 'X-Organization-Id': otherOrg };
      const otherDoc = await request(server).post('/api/v1/documents').set(otherAs).send({ templateCode: code }).expect(201);
      expect(otherDoc.body.templateUpdate).toBeNull();
      const otherFile = await request(server)
        .get(`/api/v1/documents/${otherDoc.body.id}/versions/${otherDoc.body.versions[0].id}/file`)
        .set(otherAs)
        .buffer(true)
        .parse(binary)
        .expect(200);
      expect(docxText(otherFile.body)).toContain('IKINCI SURUM Diğer A.Ş.');
    });

    it('taslak sürüm silinebilir, başlık ve opsiyonellik değiştirilebilir, dosya indirilebilir', async () => {
      const code = randomCode();
      const created = await request(server)
        .post('/api/v1/admin/templates')
        .set(auth(admin.accessToken))
        .field('code', code)
        .field('title', 'Eski Başlık')
        .field('category', 'policy')
        .attach('file', docxWith('ILK'), 'Şablon.docx')
        .expect(201);
      const versionId = created.body.versions[0].id;
      expect(created.body.versions[0].fileName).toBe('Şablon.docx');

      const file = await request(server)
        .get(`/api/v1/admin/templates/${code}/versions/${versionId}/file`)
        .set(auth(admin.accessToken))
        .buffer(true)
        .parse(binary)
        .expect(200);
      expect(docxText(file.body)).toContain('ILK');

      const updated = await request(server)
        .patch(`/api/v1/admin/templates/${code}`)
        .set(auth(admin.accessToken))
        .send({ title: 'Yeni Başlık', optional: true })
        .expect(200);
      expect(updated.body).toMatchObject({ title: 'Yeni Başlık', optional: true });

      await request(server)
        .delete(`/api/v1/admin/templates/${code}/versions/${versionId}`)
        .set(auth(admin.accessToken))
        .expect(204);
      const after = await request(server).get(`/api/v1/admin/templates/${code}`).set(auth(admin.accessToken)).expect(200);
      expect(after.body.versions).toEqual([]);
    });
  });
});

describe('İlk platform yöneticisi (PLATFORM_ADMIN_EMAILS)', () => {
  it('kayıtlı kullanıcıyı yönetici yapar, kayıtlı değilse hesap açıp şifre oluşturma bağlantısı gönderir', async () => {
    const first = await createApp();
    const existing = await registerAndLogin(first);
    await first.close();

    const newEmail = uniqueEmail('yonetici');
    process.env.PLATFORM_ADMIN_EMAILS = `${existing.email.toUpperCase()}, ${newEmail}`;
    const app = await createApp();
    try {
      const server = app.getHttpServer();
      const me = await request(server).get('/api/v1/auth/me').set('Authorization', `Bearer ${existing.accessToken}`);
      expect(me.body.isPlatformAdmin).toBe(true);

      const mail = lastMailTo(app, newEmail);
      expect(mail.text).toContain('platform yöneticisi');
      await request(server)
        .post('/api/v1/auth/password-reset/confirm')
        .send({ token: extractCode(mail.text), password: PASSWORD })
        .expect(204);
      const created = await login(app, newEmail);
      await request(server)
        .get('/api/v1/admin/organizations')
        .set('Authorization', `Bearer ${created.accessToken}`)
        .expect(200);
    } finally {
      delete process.env.PLATFORM_ADMIN_EMAILS;
      await app.close();
    }
  });
});
