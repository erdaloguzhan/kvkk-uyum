import { NO_FOREIGN_TRANSFER, NO_RECIPIENTS } from '@kvkk/shared';
import { INestApplication } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import ExcelJS from 'exceljs';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { Database, DB } from '../src/db/db.module';
import { auditLogs, inventoryEntries, tasks } from '../src/db/schema';
import { createApp, createOrg, registerAndLogin } from './helpers';

/**
 * Pilot test hata 1 (Erdal, 17.11.2026): Departman 1→N Faaliyet, (Departman, Faaliyet) 1→N Veri kategorisi,
 * (…, Kategori) 1→N Kişisel veri; diğer alanlar bu üçlünün tek satırında. Aynı üçlü iki satır olamaz.
 */
describe('Envanter hiyerarşisi (mükerrer veri kategorisi)', () => {
  let app: INestApplication;
  let server: any;
  let db: Database;

  beforeAll(async () => {
    app = await createApp();
    server = app.getHttpServer();
    db = app.get(DB);
  });
  afterAll(() => app.close());

  async function setupOrg() {
    const admin = await registerAndLogin(app);
    const orgId = await createOrg(app, admin, { name: 'Hiyerarşi Test A.Ş.' });
    const headers = { Authorization: `Bearer ${admin.accessToken}`, 'X-Organization-Id': orgId };
    return { admin, orgId, headers };
  }

  it('aynı departman + faaliyet + kategoriyi büyük/küçük harf ve boşluk farkıyla da ikinci kez eklemez', async () => {
    const { headers } = await setupOrg();
    const first = await request(server)
      .post('/api/v1/inventory')
      .set(headers)
      .send({ department: 'İnsan Kaynakları', activity: 'Özlük Dosyası', dataCategory: 'Kimlik', personalData: 'Ad, Soyad' })
      .expect(201);

    const dup = await request(server)
      .post('/api/v1/inventory')
      .set(headers)
      .send({ department: ' insan  kaynakları', activity: 'ÖZLÜK DOSYASI', dataCategory: 'kimlik', personalData: 'Doğum tarihi' })
      .expect(409);
    expect(dup.body.message).toContain('zaten var');
    expect(dup.body.existingId).toBe(first.body.id);

    // Aynı süreçte başka kategori ve aynı departmanda başka faaliyet eklenebilir; yazılış mevcut satırınkine uyar.
    const other = await request(server)
      .post('/api/v1/inventory')
      .set(headers)
      .send({ department: 'insan kaynakları', activity: 'özlük dosyası', dataCategory: 'İletişim' })
      .expect(201);
    expect(other.body).toMatchObject({ department: 'İnsan Kaynakları', activity: 'Özlük Dosyası' });
    await request(server)
      .post('/api/v1/inventory')
      .set(headers)
      .send({ department: 'İnsan Kaynakları', activity: 'İşe Alım', dataCategory: 'Kimlik' })
      .expect(201);

    // Düzenlemede de var olan bir üçlüye dönüştürülemez.
    await request(server).patch(`/api/v1/inventory/${other.body.id}`).set(headers).send({ dataCategory: 'KİMLİK' }).expect(409);
    // Kendi kategorisinin yazılışı değiştirilebilir.
    await request(server).patch(`/api/v1/inventory/${first.body.id}`).set(headers).send({ dataCategory: 'KİMLİK' }).expect(200);
  });

  it('bir kategorideki aynı kişisel veriyi bir kez saklar', async () => {
    const { headers } = await setupOrg();
    const res = await request(server)
      .post('/api/v1/inventory')
      .set(headers)
      .send({ department: 'Muhasebe', activity: 'Bordro', dataCategory: 'Kimlik', personalData: 'Ad, Soyad, ad,  Doğum tarihi' })
      .expect(201);
    expect(res.body.personalData).toBe('Ad, Soyad, Doğum tarihi');
    const kept = await request(server)
      .patch(`/api/v1/inventory/${res.body.id}`)
      .set(headers)
      .send({ personalData: 'Ad\nSoyad' })
      .expect(200);
    expect(kept.body.personalData).toBe('Ad\nSoyad');
  });

  it('Excel içe aktarımda dosyada tekrar eden kategoriyi satır numarasıyla bildirir', async () => {
    const { headers } = await setupOrg();
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Envanter');
    ws.addRow(['Departman', 'Faaliyet', 'Veri Kategorisi', 'Kişisel Veri']);
    ws.addRow(['Muhasebe', 'Bordro', 'Kimlik', 'Ad']);
    ws.addRow(['Muhasebe', 'Bordro', 'İletişim', 'Telefon']);
    ws.addRow(['muhasebe', 'Bordro', 'kimlik', 'Soyad']);
    const file = Buffer.from(await wb.xlsx.writeBuffer());
    const res = await request(server)
      .post('/api/v1/inventory/import?mode=replace')
      .set(headers)
      .attach('file', file, 'envanter.xlsx')
      .expect(400);
    expect(res.body.errors).toEqual([{ row: 4, message: expect.stringContaining('2. satırda da var') }]);
  });

  it('geçiş mevcut mükerrer satırları kayıpsız birleştirir', async () => {
    const { admin, orgId } = await setupOrg();
    const migration = readFileSync(
      path.resolve(__dirname, '../drizzle/0031_inventory_unique_process_category.sql'),
      'utf8',
    );
    await db.execute(sql`DROP INDEX "inventory_entries_org_process_category_unique"`);
    try {
      const t = (min: number) => new Date(Date.UTC(2026, 10, 15, 10, min));
      const base = { organizationId: orgId, createdBy: admin.user.id };
      const [keeper, dup1, dup2, other] = await db
        .insert(inventoryEntries)
        .values([
          {
            ...base,
            createdAt: t(1),
            department: 'Satış',
            activity: 'Müşteri Kaydı',
            dataCategory: 'Kimlik',
            personalData: 'Ad, Soyad',
            purposes: ['Satış Süreçlerinin Yürütülmesi'],
            recipients: [NO_RECIPIENTS],
            retentionPeriod: '10 yıl',
            foreignTransfers: NO_FOREIGN_TRANSFER,
            technicalMeasures: ['Yedekleme'],
          },
          {
            ...base,
            createdAt: t(2),
            department: 'satış ',
            activity: 'Müşteri  kaydı',
            dataCategory: 'KİMLİK',
            personalData: 'soyad\nT.C. kimlik no',
            purposes: ['Satış Süreçlerinin Yürütülmesi', 'Faaliyetlerin Mevzuata Uygun Yürütülmesi'],
            recipients: ['Tedarikçiler'],
            retentionPeriod: '5 yıl',
            foreignTransfers: `KİMLİK: Bu departman, süreç ve veri kategoride yurtdışına veri aktarılmaktadır.`,
            technicalMeasures: ['Yedekleme', 'Log Kayıtları'],
          },
          {
            ...base,
            createdAt: t(3),
            department: 'Satış',
            activity: 'Müşteri Kaydı',
            dataCategory: 'Kimlik',
            specialCategoryData: 'Sağlık raporu',
            dataSubjectGroups: ['Müşteri'],
          },
          { ...base, createdAt: t(4), department: 'Satış', activity: 'Müşteri Kaydı', dataCategory: 'İletişim' },
        ])
        .returning();
      const [task] = await db
        .insert(tasks)
        .values({
          organizationId: orgId,
          type: 'inventory_review',
          title: 'Gözden geçir',
          assigneeId: admin.user.id,
          dueDate: '2026-12-01',
          entityType: 'inventory_entry',
          entityId: dup2.id,
        })
        .returning();

      for (const statement of migration.split('--> statement-breakpoint')) await db.execute(sql.raw(statement));

      const rows = await db.select().from(inventoryEntries).where(eq(inventoryEntries.organizationId, orgId));
      expect(rows.map((r) => r.id).sort()).toEqual([keeper.id, other.id].sort());
      const merged = rows.find((r) => r.id === keeper.id)!;
      expect(merged).toMatchObject({
        department: 'Satış',
        activity: 'Müşteri Kaydı',
        dataCategory: 'Kimlik',
        personalData: 'Ad, Soyad, T.C. kimlik no',
        specialCategoryData: 'Sağlık raporu',
        purposes: ['Satış Süreçlerinin Yürütülmesi', 'Faaliyetlerin Mevzuata Uygun Yürütülmesi'],
        dataSubjectGroups: ['Müşteri'],
        recipients: ['Tedarikçiler'],
        retentionPeriod: '10 yıl',
        foreignTransfers: 'KİMLİK: Bu departman, süreç ve veri kategoride yurtdışına veri aktarılmaktadır.',
        technicalMeasures: ['Yedekleme', 'Log Kayıtları'],
      });
      const [movedTask] = await db.select().from(tasks).where(eq(tasks.id, task.id));
      expect(movedTask.entityId).toBe(keeper.id);
      const [log] = await db
        .select()
        .from(auditLogs)
        .where(and(eq(auditLogs.organizationId, orgId), eq(auditLogs.action, 'inventory.duplicates_merged')));
      expect(log.entityId).toBe(keeper.id);
      expect(log.metadata).toMatchObject({
        mergedIds: [dup1.id, dup2.id],
        conflicts: { retentionPeriod: ['10 yıl', '5 yıl'] },
      });
    } finally {
      await db.execute(
        sql`CREATE UNIQUE INDEX IF NOT EXISTS "inventory_entries_org_process_category_unique" ON "inventory_entries" USING btree ("organization_id",lower(translate("department", 'İIı', 'iii')),lower(translate("activity", 'İIı', 'iii')),lower(translate("data_category", 'İIı', 'iii')))`,
      );
    }
  });
});
