import { INestApplication } from '@nestjs/common';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { createApp, extractCode, lastMailTo, login, registerAndLogin, uniqueEmail } from './helpers';

/** TBL-010'daki ilk örnek satırın bir kısmı. */
const ENTRY = {
  department: 'Muhasebe',
  activity: 'Çalışan Özlük Dosyaları',
  dataCategory: 'Kimlik',
  personalData: 'ad soyad, doğum tarihi, tc kimlik',
  purposes: ['Çalışanlar İçin İş Akdi ve Mevzuat Kaynaklı Yükümlülüklerin Yerine Getirilmesi'],
  storageMedium: 'both',
  storageLocation: 'Kilitli dolap, Muhasebe bilgisayarında',
  dataSubjectGroups: ['Çalışanlar', 'Stajyerler'],
  legalBases: [
    'Bir sözleşmenin kurulması veya ifasıyla doğrudan doğruya ilgili olması kaydıyla, sözleşmenin taraflarına ait kişisel verilerin işlenmesinin gerekli olması.',
  ],
  relatedLegislation: '4857 sayılı İş Kanunu',
  retentionPeriod: '15 yıl',
  recipients: ['SGK Ve Diğer Yetkili Kurum ve Kuruluşlar', 'Mali Müşavir'],
  administrativeMeasures: ['Gizlilik Taahhütnameleri'],
  technicalMeasures: ['Güvenlik Duvarları', 'Güncel Anti-Virüs Sistemleri'],
};

function binary(res: any, cb: (err: Error | null, body: Buffer) => void) {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
}

describe('Kişisel Veri Envanteri', () => {
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

  it('TBL-010 sütunlarını ve şablondaki örnek değerleri öneri olarak verir', async () => {
    const { admin, as } = await setupOrg();
    const res = await request(server).get('/api/v1/inventory/options').set(as(admin.accessToken)).expect(200);
    expect(res.body.columns).toHaveLength(16);
    expect(res.body.columns.map((c: any) => c.label)).toEqual([
      'Departman',
      'Faaliyet',
      'Veri Kategorisi',
      'Kişisel Veri',
      'Özel Nitelikli Kişisel Veri',
      'İşleme Amacı',
      'Fiziksel/Dijital',
      'Bulunduğu yer',
      'Veri Konusu Kişi Grubu',
      'Hukuki Sebebi',
      'İlgili Mevzuat',
      'Saklama Süresi',
      'Alıcı / Alıcı Grupları',
      'Yabancı Ülkelere Aktarılan Veriler',
      'İdari Tedbirler',
      'Teknik Tedbirler',
    ]);
    expect(res.body.suggestions.dataCategory).toContain('Sağlık');
    // Hazır seçenekler verildiği sırayla önerilir.
    expect(res.body.suggestions.technicalMeasures).toHaveLength(17);
    expect(res.body.suggestions.technicalMeasures[0]).toBe('Yetki Matrisi');
    expect(res.body.suggestions.technicalMeasures[16]).toBe('Anahtar Yönetimi');
    expect(res.body.suggestions.administrativeMeasures).toHaveLength(10);
    expect(res.body.suggestions.administrativeMeasures[0]).toBe('Kişisel Veri İşleme Envanteri Hazırlanması');

    // Kuruluşun kendi girdiği değer de önerilere eklenir.
    await request(server)
      .post('/api/v1/inventory')
      .set(as(admin.accessToken))
      .send({
        department: 'Satış',
        activity: 'Müşteri kayıtları',
        dataCategory: 'Müşteri İşlem',
        technicalMeasures: ['Ağ Güvenliği', 'Biyometrik giriş kontrolü'],
      })
      .expect(201);
    const again = await request(server).get('/api/v1/inventory/options').set(as(admin.accessToken)).expect(200);
    expect(again.body.suggestions.department).toEqual(['İdari', 'Muhasebe', 'Satış']);
    expect(again.body.suggestions.technicalMeasures).toHaveLength(18);
    expect(again.body.suggestions.technicalMeasures[17]).toBe('Biyometrik giriş kontrolü');
  });

  it('satırı oluşturur, eksik alanları gösterir, günceller ve loglar', async () => {
    const { admin, as } = await setupOrg();
    const created = await request(server)
      .post('/api/v1/inventory')
      .set(as(admin.accessToken))
      .send({ department: 'İdari', activity: 'Çalışan Özlük Dosyaları', dataCategory: 'İletişim', personalData: '  ' })
      .expect(201);
    expect(created.body).toMatchObject({ complete: false, personalData: null, purposes: [] });
    expect(created.body.missingFields).toEqual([
      'personalData',
      'purposes',
      'storageMedium',
      'storageLocation',
      'dataSubjectGroups',
      'legalBases',
      'retentionPeriod',
      'administrativeMeasures',
      'technicalMeasures',
    ]);

    const { department, activity, dataCategory, ...rest } = ENTRY;
    const updated = await request(server)
      .patch(`/api/v1/inventory/${created.body.id}`)
      .set(as(admin.accessToken))
      .send({ ...rest, dataSubjectGroups: ['Çalışanlar', 'Çalışanlar', ''] })
      .expect(200);
    expect(updated.body).toMatchObject({ complete: true, missingFields: [], dataSubjectGroups: ['Çalışanlar'] });

    // Zorunlu alanlar boşaltılamaz, geçersiz değer kabul edilmez.
    await request(server)
      .patch(`/api/v1/inventory/${created.body.id}`)
      .set(as(admin.accessToken))
      .send({ department: '' })
      .expect(400);
    await request(server)
      .patch(`/api/v1/inventory/${created.body.id}`)
      .set(as(admin.accessToken))
      .send({ storageMedium: 'bulut' })
      .expect(400);
    await request(server).post('/api/v1/inventory').set(as(admin.accessToken)).send({ department: 'İdari' }).expect(400);

    const logs = await request(server).get('/api/v1/audit-logs').set(as(admin.accessToken)).expect(200);
    const update = logs.body.items.find((l: any) => l.action === 'inventory.updated');
    expect(update.metadata.fields).toContain('technicalMeasures');
    expect(logs.body.items.some((l: any) => l.action === 'inventory.created')).toBe(true);
  });

  it('listeyi filtreler, özet verir, kopyalar ve siler', async () => {
    const { admin, as } = await setupOrg();
    const full = await request(server).post('/api/v1/inventory').set(as(admin.accessToken)).send(ENTRY).expect(201);
    expect(full.body.complete).toBe(true);
    await request(server)
      .post('/api/v1/inventory')
      .set(as(admin.accessToken))
      .send({
        department: 'Muhasebe',
        activity: 'Çalışan Sağlık Bilgileri',
        dataCategory: 'Sağlık',
        specialCategoryData: 'Sağlık raporu',
      })
      .expect(201);
    const copy = await request(server)
      .post(`/api/v1/inventory/${full.body.id}/duplicate`)
      .set(as(admin.accessToken))
      .expect(201);
    expect(copy.body.id).not.toBe(full.body.id);
    expect(copy.body.technicalMeasures).toEqual(ENTRY.technicalMeasures);
    await request(server)
      .patch(`/api/v1/inventory/${copy.body.id}`)
      .set(as(admin.accessToken))
      .send({ department: 'İdari', dataCategory: 'Özlük' })
      .expect(200);

    const all = await request(server).get('/api/v1/inventory').set(as(admin.accessToken)).expect(200);
    expect(all.body.items.map((e: any) => e.department)).toEqual(['İdari', 'Muhasebe', 'Muhasebe']);
    const muhasebe = await request(server)
      .get('/api/v1/inventory?department=Muhasebe&incomplete=true')
      .set(as(admin.accessToken))
      .expect(200);
    expect(muhasebe.body.items.map((e: any) => e.dataCategory)).toEqual(['Sağlık']);

    const summary = await request(server).get('/api/v1/inventory/summary').set(as(admin.accessToken)).expect(200);
    expect(summary.body).toMatchObject({ entries: 3, incomplete: 1, specialCategory: 1, foreignTransfer: 0 });
    expect(summary.body.departments).toEqual([
      { department: 'İdari', entries: 1, incomplete: 0 },
      { department: 'Muhasebe', entries: 2, incomplete: 1 },
    ]);

    await request(server).delete(`/api/v1/inventory/${copy.body.id}`).set(as(admin.accessToken)).expect(204);
    await request(server).get(`/api/v1/inventory/${copy.body.id}`).set(as(admin.accessToken)).expect(404);
  });

  it('envanteri TBL-010 biçiminde Excel olarak dışa aktarır', async () => {
    const { admin, as } = await setupOrg();
    await request(server).post('/api/v1/inventory').set(as(admin.accessToken)).send(ENTRY).expect(201);
    const res = await request(server)
      .get('/api/v1/inventory/export')
      .set(as(admin.accessToken))
      .buffer(true)
      .parse(binary)
      .expect(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body);
    const sheet = wb.worksheets[0];
    expect(sheet.getCell('A1').value).toBe('ORGANİZASYON');
    expect(sheet.getCell('P2').value).toBe('Teknik Tedbirler');
    const row = sheet.getRow(3);
    expect(row.getCell(1).value).toBe('Muhasebe');
    expect(row.getCell(7).value).toBe('Fiziksel ve Dijital');
    expect(row.getCell(9).value).toBe('Çalışanlar, Stajyerler');
    expect(row.getCell(16).value).toBe(ENTRY.technicalMeasures.join('\n'));
    // Şablondaki örnek satırlar dosyada kalmaz.
    expect(sheet.getRow(4).getCell(1).value).toBeNull();
    expect(sheet.getRow(7).getCell(16).value).toBeNull();
  });

  it('kuruluşlar arası erişimi ve yetkileri uygular', async () => {
    const a = await setupOrg();
    const b = await setupOrg();
    const entry = await request(server).post('/api/v1/inventory').set(a.as(a.admin.accessToken)).send(ENTRY).expect(201);

    await request(server).get(`/api/v1/inventory/${entry.body.id}`).set(b.as(b.admin.accessToken)).expect(404);
    await request(server)
      .patch(`/api/v1/inventory/${entry.body.id}`)
      .set(b.as(b.admin.accessToken))
      .send({ retentionPeriod: '1 yıl' })
      .expect(404);
    const listB = await request(server).get('/api/v1/inventory').set(b.as(b.admin.accessToken)).expect(200);
    expect(listB.body.items).toEqual([]);

    const viewer = await addViewer(a.admin, a.as);
    await request(server).get('/api/v1/inventory').set(a.as(viewer.accessToken)).expect(200);
    await request(server).get('/api/v1/inventory/export').set(a.as(viewer.accessToken)).expect(200);
    await request(server).post('/api/v1/inventory').set(a.as(viewer.accessToken)).send(ENTRY).expect(403);
    await request(server).delete(`/api/v1/inventory/${entry.body.id}`).set(a.as(viewer.accessToken)).expect(403);
  });
});
