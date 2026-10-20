import { INestApplication } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { addMember, createApp, createOrg, extractCode, lastMailTo, login, registerAndLogin, uniqueEmail } from './helpers';

/** TBL-010'daki ilk örnek satırın bir kısmı. */
const ENTRY = {
  department: 'Muhasebe',
  activity: 'Çalışan Özlük Dosyaları',
  dataCategory: 'Kimlik',
  personalData: 'ad soyad, doğum tarihi, tc kimlik',
  purposes: ['Çalışanlar İçin İş Akdi Ve Mevzuattan Kaynaklı Yükümlülüklerin Yerine Getirilmesi'],
  storageMedium: 'both',
  storageLocation: 'Kilitli dolap, Muhasebe bilgisayarında',
  dataSubjectGroups: ['Çalışan', 'Stajyer'],
  legalBases: [
    'c) Bir sözleşmenin kurulması veya ifasıyla doğrudan doğruya ilgili olması kaydıyla, sözleşmenin taraflarına ait kişisel verilerin işlenmesinin gerekli olması.',
  ],
  relatedLegislation: '4857 sayılı İş Kanunu',
  retentionPeriod: '15 yıl',
  recipients: ['Yetkili Kamu Kurum ve Kuruluşları', 'Tedarikçiler'],
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
    const orgId = await createOrg(app, admin, { name: 'Örnek Ticaret A.Ş.' });
    const as = (token: string) => ({ Authorization: `Bearer ${token}`, 'X-Organization-Id': orgId });
    return { admin, orgId, as };
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
    expect(res.body.suggestions.dataCategory).toHaveLength(26);
    expect(res.body.suggestions.dataCategory[0]).toBe('Kimlik');
    const health = res.body.dataCategories.find((c: any) => c.name === 'Sağlık Bilgileri');
    expect(health).toMatchObject({ special: true });
    expect(res.body.dataCategories.filter((c: any) => c.special)).toHaveLength(13);
    // Hazır seçenekler verildiği sırayla önerilir.
    expect(res.body.suggestions.purposes).toHaveLength(52);
    expect(res.body.suggestions.recipients).toHaveLength(9);
    expect(res.body.suggestions.legalBases).toHaveLength(7);
    expect(res.body.suggestions.legalBases[3]).toMatch(/^ç\) /);
    expect(res.body.suggestions.dataSubjectGroups).toHaveLength(14);
    expect(res.body.suggestions.dataSubjectGroups[0]).toBe('Çalışan Adayı');
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
      .send({ ...rest, dataSubjectGroups: ['Çalışan', 'Çalışan', ''] })
      .expect(200);
    expect(updated.body).toMatchObject({ complete: true, missingFields: [], dataSubjectGroups: ['Çalışan'] });

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
    expect(row.getCell(9).value).toBe('Çalışan, Stajyer');
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

    // Yönetici envanteri görür ve onaylar ama değiştiremez.
    const approver = await addMember(app, a.orgId, 'approver');
    await request(server).get('/api/v1/inventory').set(a.as(approver.accessToken)).expect(200);
    await request(server).get('/api/v1/inventory/export').set(a.as(approver.accessToken)).expect(200);
    await request(server)
      .patch(`/api/v1/inventory/${entry.body.id}`)
      .set(a.as(approver.accessToken))
      .send({ retentionPeriod: '1 yıl' })
      .expect(403);
    const officer = await addMember(app, a.orgId, 'kvkk_officer');
    await request(server).get('/api/v1/inventory/export').set(a.as(officer.accessToken)).expect(200);
    await request(server).post('/api/v1/inventory').set(a.as(officer.accessToken)).send(ENTRY).expect(201);
    await request(server).post('/api/v1/inventory').set(a.as(approver.accessToken)).send(ENTRY).expect(403);
    await request(server).delete(`/api/v1/inventory/${entry.body.id}`).set(a.as(approver.accessToken)).expect(403);
  });

  it('değişiklikleri Yönetici onayına gönderir; Yönetici onaylar veya gerekçeyle reddeder', async () => {
    const { admin, orgId, as } = await setupOrg();
    const officer = await addMember(app, orgId, 'kvkk_officer', 'Selin Sorumlu');
    const yonetici = await addMember(app, orgId, 'approver', 'Zeynep Yönetici');
    const o = as(officer.accessToken);
    const y = as(yonetici.accessToken);

    const first = await request(server).post('/api/v1/inventory').set(o).send(ENTRY).expect(201);
    const second = await request(server)
      .post('/api/v1/inventory')
      .set(o)
      .send({ department: 'İnsan Kaynakları', activity: 'İşe Alım', dataCategory: 'İletişim' })
      .expect(201);
    let status = await request(server).get('/api/v1/inventory/approval').set(o).expect(200);
    expect(status.body).toMatchObject({ lastApproved: null, pending: null });
    expect(status.body.changes.map((c: any) => [c.kind, c.entryId]).sort()).toEqual(
      [['added', first.body.id], ['added', second.body.id]].sort(),
    );

    // Onaylayıcı envanter onay yetkisi olan biri olmalı; Sorumlu onaylayamaz.
    await request(server).post('/api/v1/inventory/approval-requests').set(o).send({ approverId: officer.user.id }).expect(400);
    await request(server).post('/api/v1/inventory/approval-requests').set(y).send({ approverId: yonetici.user.id }).expect(403);
    const req1 = await request(server)
      .post('/api/v1/inventory/approval-requests')
      .set(o)
      .send({ approverId: yonetici.user.id, note: 'İlk envanter' })
      .expect(201);
    expect(req1.body).toMatchObject({
      status: 'pending',
      note: 'İlk envanter',
      approver: { id: yonetici.user.id },
      requestedBy: { id: officer.user.id },
    });
    expect(req1.body.changes).toHaveLength(2);
    await request(server).post('/api/v1/inventory/approval-requests').set(o).send({ approverId: yonetici.user.id }).expect(409);
    expect(lastMailTo(app, yonetici.email).subject).toBe('Onay talebi: Veri envanteri değişiklikleri');
    const tasks = await request(server).get('/api/v1/tasks?mine=true').set(y).expect(200);
    expect(tasks.body.items).toEqual([
      expect.objectContaining({ type: 'approval', entityType: 'inventory_approval', entityId: req1.body.id, status: 'open' }),
    ]);

    // Kararı yalnızca seçilen Yönetici verir.
    await request(server).post(`/api/v1/inventory/approval-requests/${req1.body.id}/approve`).set(o).send({}).expect(403);
    await request(server)
      .post(`/api/v1/inventory/approval-requests/${req1.body.id}/approve`)
      .set(as(admin.accessToken))
      .send({})
      .expect(403);
    const approved = await request(server)
      .post(`/api/v1/inventory/approval-requests/${req1.body.id}/approve`)
      .set(y)
      .send({ note: 'Uygundur' })
      .expect(200);
    expect(approved.body).toMatchObject({ status: 'approved', decisionNote: 'Uygundur', decidedBy: { id: yonetici.user.id } });
    expect(lastMailTo(app, officer.email).subject).toBe('Veri envanteri değişiklikleri onaylandı');
    const task = await request(server).get(`/api/v1/tasks/${tasks.body.items[0].id}`).set(y).expect(200);
    expect(task.body.status).toBe('done');
    status = await request(server).get('/api/v1/inventory/approval').set(o).expect(200);
    expect(status.body).toMatchObject({ lastApproved: { id: req1.body.id }, pending: null, changes: [] });
    await request(server).post('/api/v1/inventory/approval-requests').set(o).send({ approverId: yonetici.user.id }).expect(409);

    // Onaydan sonraki değişiklikler: önceki ve yeni değerleriyle listelenir.
    await request(server).patch(`/api/v1/inventory/${first.body.id}`).set(o).send({ retentionPeriod: '10 yıl' }).expect(200);
    await request(server).delete(`/api/v1/inventory/${second.body.id}`).set(o).expect(204);
    status = await request(server).get('/api/v1/inventory/approval').set(y).expect(200);
    expect(status.body.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'updated',
          entryId: first.body.id,
          fields: [{ field: 'retentionPeriod', before: '15 yıl', after: '10 yıl' }],
        }),
        expect.objectContaining({ kind: 'deleted', entryId: second.body.id, department: 'İnsan Kaynakları' }),
      ]),
    );
    const req2 = await request(server).post('/api/v1/inventory/approval-requests').set(o).send({ approverId: yonetici.user.id }).expect(201);
    await request(server).post(`/api/v1/inventory/approval-requests/${req2.body.id}/reject`).set(y).send({}).expect(400);
    const rejected = await request(server)
      .post(`/api/v1/inventory/approval-requests/${req2.body.id}/reject`)
      .set(y)
      .send({ note: 'Saklama süresi mevzuata uymuyor' })
      .expect(200);
    expect(rejected.body.status).toBe('rejected');
    expect(lastMailTo(app, officer.email).text).toContain('Saklama süresi mevzuata uymuyor');
    // Reddedilen değişiklikler onaysız kalır; Sorumlu düzeltip yeniden gönderir veya talebi iptal eder.
    status = await request(server).get('/api/v1/inventory/approval').set(o).expect(200);
    expect(status.body.lastApproved.id).toBe(req1.body.id);
    expect(status.body.changes).toHaveLength(2);
    const req3 = await request(server).post('/api/v1/inventory/approval-requests').set(o).send({ approverId: yonetici.user.id }).expect(201);
    await request(server).post(`/api/v1/inventory/approval-requests/${req3.body.id}/cancel`).set(y).expect(403);
    await request(server).post(`/api/v1/inventory/approval-requests/${req3.body.id}/cancel`).set(o).expect(200);
    await request(server).post(`/api/v1/inventory/approval-requests/${req3.body.id}/approve`).set(y).send({}).expect(409);

    const list = await request(server).get('/api/v1/inventory/approval-requests').set(y).expect(200);
    expect(list.body.items.map((r: any) => [r.status, r.changeCount])).toEqual([
      ['cancelled', 2],
      ['rejected', 2],
      ['approved', 2],
    ]);
    const logs = await request(server).get('/api/v1/audit-logs').set(as(admin.accessToken)).expect(200);
    const actions = logs.body.items.map((l: any) => l.action);
    for (const action of [
      'inventory.approval_requested',
      'inventory.approval_approved',
      'inventory.approval_rejected',
      'inventory.approval_cancelled',
    ]) {
      expect(actions).toContain(action);
    }
  });

  describe('Excel içe aktarma', () => {
    const TEMPLATE = path.resolve(__dirname, '../../../content/tablolar/TBL-010 Kişisel Veri Envanteri Tablosu.xlsx');

    function upload(headers: Record<string, string>, file: Buffer, query = '') {
      return request(server)
        .post(`/api/v1/inventory/import${query}`)
        .set(headers)
        .attach('file', file, 'envanter.xlsx');
    }

    async function workbook(rows: (string | null)[][], merges: string[] = []) {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Envanter');
      rows.forEach((r) => ws.addRow(r));
      merges.forEach((m) => ws.mergeCells(m));
      return Buffer.from(await wb.xlsx.writeBuffer());
    }

    it('TBL-010 şablonundaki örnek satırları okur', async () => {
      const { admin, as } = await setupOrg();
      const res = await upload(as(admin.accessToken), readFileSync(TEMPLATE), '?dryRun=true').expect(200);
      expect(res.body).toMatchObject({ dryRun: true, count: 5 });
      const first = res.body.rows[0];
      expect(first).toMatchObject({
        row: 3,
        department: 'Muhasebe',
        dataCategory: 'Kimlik',
        storageMedium: 'both',
        dataSubjectGroups: ['Çalışanlar', 'Stajyerler'],
        recipients: ['SGK Ve Diğer Yetkili Kurum ve Kuruluşlar', 'Mali Müşavir', 'Bankalar'],
        retentionPeriod: '15 yıl',
      });
      expect(first.purposes).toEqual([
        'Çalışanlar İçin İş Akdi ve Mevzuat Kaynaklı Yükümlülüklerin Yerine Getirilmesi',
        'Çalışanlar İçin Yan Haklar ve Menfaatleri Süreçlerinin Yürütülmesi',
      ]);
      expect(first.technicalMeasures).toHaveLength(7);
      expect(res.body.rows[1]).toMatchObject({ dataCategory: 'Sağlık', specialCategoryData: expect.stringContaining('Sağlık raporu') });
      expect(res.body.rows[1].personalData).toBeUndefined();

      // Kontrol modunda hiçbir şey kaydedilmez.
      const list = await request(server).get('/api/v1/inventory').set(as(admin.accessToken)).expect(200);
      expect(list.body.items).toEqual([]);
    });

    it('dışa aktarılan dosyayı geri alır; ekleme ve değiştirme modları', async () => {
      const { admin, as } = await setupOrg();
      await request(server).post('/api/v1/inventory').set(as(admin.accessToken)).send(ENTRY).expect(201);
      const exported = await request(server)
        .get('/api/v1/inventory/export')
        .set(as(admin.accessToken))
        .buffer(true)
        .parse(binary)
        .expect(200);

      const appended = await upload(as(admin.accessToken), exported.body).expect(200);
      expect(appended.body).toMatchObject({ mode: 'append', count: 1, removed: 0 });
      let list = await request(server).get('/api/v1/inventory').set(as(admin.accessToken)).expect(200);
      expect(list.body.items).toHaveLength(2);
      const { id, createdAt, updatedAt, createdBy, updatedBy, organizationId, ...a } = list.body.items[0];
      const { id: _i, createdAt: _c, updatedAt: _u, createdBy: _cb, updatedBy: _ub, organizationId: _o, ...b } =
        list.body.items[1];
      expect(b).toEqual(a);

      const replaced = await upload(as(admin.accessToken), exported.body, '?mode=replace').expect(200);
      expect(replaced.body).toMatchObject({ mode: 'replace', count: 1, removed: 2 });
      list = await request(server).get('/api/v1/inventory').set(as(admin.accessToken)).expect(200);
      expect(list.body.items).toHaveLength(1);

      const logs = await request(server).get('/api/v1/audit-logs').set(as(admin.accessToken)).expect(200);
      const imported = logs.body.items.filter((l: any) => l.action === 'inventory.imported');
      expect(imported.map((l: any) => l.metadata.mode).sort()).toEqual(['append', 'replace']);
    });

    it('hatalı satırları numarasıyla bildirir ve hiçbir satırı kaydetmez', async () => {
      const { admin, as } = await setupOrg();
      // Sütun sırası farklı, başlık üstünde bir başlık satırı daha var, departman hücreleri birleştirilmiş.
      const header = ['Kişisel Veri Envanteri', null, null, null, null];
      const labels = ['Faaliyet', 'Departman', 'Veri Kategorisi', 'Fiziksel/Dijital', 'Veri Konusu Kişi Grubu'];
      const file = await workbook(
        [
          header,
          labels,
          ['Bordro', 'Muhasebe', 'Özlük', 'Dijital', 'Çalışan, Stajyer'],
          ['Ziyaretçi kaydı', null, 'Fiziksel Mekân Güvenliği', 'Bulut', 'Ziyaretçi'],
          [null, 'İdari', 'Kimlik', 'Fiziksel', null],
          [null, null, null, null, null],
        ],
        ['B3:B4'],
      );
      const res = await upload(as(admin.accessToken), file).expect(400);
      expect(res.body.errors).toEqual([
        expect.objectContaining({ row: 4, column: 'Fiziksel/Dijital' }),
        { row: 5, field: 'activity', column: 'Faaliyet', message: 'Bu sütun boş bırakılamaz' },
      ]);
      const list = await request(server).get('/api/v1/inventory').set(as(admin.accessToken)).expect(200);
      expect(list.body.items).toEqual([]);

      const fixed = await workbook(
        [labels, ['Bordro', 'Muhasebe', 'Özlük', 'Dijital', 'Çalışan, Stajyer'], ['Ziyaretçi kaydı', null, 'Fiziksel Mekân Güvenliği', 'Fiziksel', 'Ziyaretçi']],
        ['B2:B3'],
      );
      const ok = await upload(as(admin.accessToken), fixed, '?dryRun=true').expect(200);
      expect(ok.body.rows.map((r: any) => [r.department, r.storageMedium, r.dataSubjectGroups])).toEqual([
        ['Muhasebe', 'digital', ['Çalışan', 'Stajyer']],
        ['Muhasebe', 'physical', ['Ziyaretçi']],
      ]);
    });

    it('geçersiz dosyaları ve yetkisiz kullanıcıyı reddeder', async () => {
      const { admin, as, orgId } = await setupOrg();
      await upload(as(admin.accessToken), Buffer.from('düz metin')).expect(400);
      const noHeaders = await workbook([['a', 'b'], ['c', 'd']]);
      const res = await upload(as(admin.accessToken), noHeaders).expect(400);
      expect(res.body.message).toContain('TBL-010 başlıkları bulunamadı');
      await request(server).post('/api/v1/inventory/import').set(as(admin.accessToken)).expect(400);

      const approver = await addMember(app, orgId, 'approver');
      await upload(as(approver.accessToken), readFileSync(TEMPLATE)).expect(403);
    });
  });
});
