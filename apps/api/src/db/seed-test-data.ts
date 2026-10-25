import 'reflect-metadata';
import { INVENTORY_TEMPLATE_OPTIONS } from '@kvkk/shared';
import { NestFactory } from '@nestjs/core';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { AdminOrganizationsService } from '../admin/admin-organizations.service';
import { AppModule } from '../app.module';
import { hashPassword } from '../common/crypto';
import { ContractsService } from '../contracts/contracts.service';
import { DocumentsService } from '../documents/documents.service';
import { InventoryService } from '../inventory/inventory.service';
import { EmployeesService } from '../training/employees.service';
import { GroupsService } from '../training/groups.service';
import { PortalAuthService } from '../training/portal-auth.service';
import { PortalDocumentsService } from '../training/portal-documents.service';
import { TrainersService } from '../training/trainers.service';
import { TrainingsService } from '../training/trainings.service';
import { ApprovalsService } from '../workflow/approvals.service';
import { TasksService } from '../workflow/tasks.service';
import { Database, DB } from './db.module';
import { documents, documentVersions, organizations, trainingAccounts, users } from './schema';

/**
 * Yerel deneme kurulumuna hazır test verisi yükler: iki kuruluş, kullanıcılar, dokümanlar, envanter,
 * sözleşmeler, görevler, çalışanlar ve bir eğitim. Tüm hesapların şifresi aynıdır ve e-posta doğrulaması
 * gerekmeden girilebilir (giriş kodu yine http://localhost:8025 adresine düşer). Yalnızca deneme içindir.
 *
 *   docker compose exec api node dist/db/seed-test-data.js
 */
export const TEST_PASSWORD = 'Deneme12345';
const ORG_A = 'Test Ticaret A.Ş.';
const ORG_B = 'Örnek Danışmanlık Ltd. Şti.';

/** Bugünden `offset` gün sonrası, YYYY-AA-GG (İstanbul saatiyle). */
function day(offset: number) {
  const d = new Date(Date.now() + offset * 86_400_000);
  return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
}

/** 9 haneli başlangıçtan kontrol haneleri doğru, uydurma bir T.C. kimlik no üretir. */
function nationalId(base: string) {
  const d = [...base].map(Number);
  const odd = d[0] + d[2] + d[4] + d[6] + d[8];
  const even = d[1] + d[3] + d[5] + d[7];
  const tenth = (((odd * 7 - even) % 10) + 10) % 10;
  const eleventh = (d.reduce((a, b) => a + b, 0) + tenth) % 10;
  return `${base}${tenth}${eleventh}`;
}

const opt = (field: keyof typeof INVENTORY_TEMPLATE_OPTIONS, ...indexes: number[]) =>
  indexes.map((i) => INVENTORY_TEMPLATE_OPTIONS[field]![i]).filter(Boolean);

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL tanımlı değil');
  // Test hesaplarının şifresi herkesçe bilinir; canlı ortama (https adresli kuruluma) yüklenmez.
  if (process.env.APP_URL?.startsWith('https://')) {
    throw new Error('Test verisi canlı ortama yüklenemez (APP_URL https ile başlıyor)');
  }
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    await seed(app.get(DB), app);
  } finally {
    await app.close();
  }
}

async function seed(db: Database, app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>>) {
  const existing = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(inArray(organizations.name, [ORG_A, ORG_B]));
  if (existing.length) {
    console.log('Test verisi zaten yüklü; hiçbir şey değiştirilmedi.');
    return;
  }
  const [admin] = await db.select({ id: users.id }).from(users).where(eq(users.isPlatformAdmin, true)).limit(1);
  if (!admin) throw new Error('Platform yöneticisi bulunamadı; önce sistemi docker compose up ile başlatın');

  const adminOrgs = app.get(AdminOrganizationsService);
  const docs = app.get(DocumentsService);
  const approvals = app.get(ApprovalsService);
  const inventory = app.get(InventoryService);
  const contracts = app.get(ContractsService);
  const tasks = app.get(TasksService);
  const employees = app.get(EmployeesService);
  const trainers = app.get(TrainersService);
  const trainings = app.get(TrainingsService);
  const groups = app.get(GroupsService);
  const portalDocs = app.get(PortalDocumentsService);

  // Kuruluşlar ve sistem kullanıcıları
  const a = await adminOrgs.create(admin.id, {
    name: ORG_A,
    address: 'Atatürk Cad. No: 10 Kadıköy / İstanbul',
    email: 'sorumlu.a@test.local',
    phone: '0216 555 01 01',
    authorizedPerson: 'Selin Sorumlu',
    taxNumber: '1234567890',
    website: 'https://test-ticaret.example.com',
    kepAddress: 'test-ticaret@hs01.kep.tr',
    approver: { email: 'yonetici.a@test.local', fullName: 'Yusuf Yönetici' },
  });
  const b = await adminOrgs.create(admin.id, {
    name: ORG_B,
    address: 'Cumhuriyet Bulvarı No: 5 Konak / İzmir',
    email: 'tek.b@test.local',
    phone: '0232 555 02 02',
    authorizedPerson: 'Tuna Tek',
    taxNumber: '9876543210',
    website: 'https://ornek-danismanlik.example.com',
    approver: { email: 'tek.b@test.local', fullName: 'Tuna Tek' },
  });
  const orgA = a.organization.id;
  const orgB = b.organization.id;
  const userId = (list: { id: string; email: string }[], email: string) => list.find((m) => m.email === email)!.id;
  const sorumlu = userId(a.members, 'sorumlu.a@test.local');
  const yonetici = userId(a.members, 'yonetici.a@test.local');
  const tek = userId(b.members, 'tek.b@test.local');

  // Dokümanlar: A'da 4 doküman onaylanıp yayınlandı, 1'i onay bekliyor, biri çalışanlardan gizli.
  for (const [orgId, actor] of [
    [orgA, sorumlu],
    [orgB, tek],
  ]) {
    await docs.setupDefaults(orgId, actor);
  }
  const drafts = await db
    .select({ documentId: documents.id, versionId: documentVersions.id, code: documents.code })
    .from(documents)
    .innerJoin(documentVersions, eq(documentVersions.documentId, documents.id))
    .where(and(eq(documents.organizationId, orgA), eq(documentVersions.status, 'draft')))
    .orderBy(documents.code);
  for (const [i, d] of drafts.slice(0, 5).entries()) {
    const req = await approvals.request(orgA, sorumlu, d.documentId, d.versionId, {
      approverId: yonetici,
      note: 'Test verisi: incelemeniz için',
    });
    if (i < 4) await approvals.approve(orgA, yonetici, req.id, 'Uygundur');
  }
  await docs.setEmployeeVisible(orgA, sorumlu, drafts[3].documentId, false);
  const bDrafts = await db
    .select({ documentId: documents.id, versionId: documentVersions.id })
    .from(documents)
    .innerJoin(documentVersions, eq(documentVersions.documentId, documents.id))
    .where(and(eq(documents.organizationId, orgB), eq(documentVersions.status, 'draft')))
    .orderBy(documents.code)
    .limit(2);
  for (const d of bDrafts) await docs.publish(orgB, tek, d.documentId, d.versionId);

  // Veri envanteri
  const entry = (department: string, activity: string, dataCategory: string, extra: Record<string, unknown> = {}) => ({
    department,
    activity,
    dataCategory,
    purposes: opt('purposes', 5),
    storageMedium: 'both' as const,
    storageLocation: 'Personel dosyası ve İK yazılımı',
    dataSubjectGroups: opt('dataSubjectGroups', 1),
    legalBases: opt('legalBases', 0, 2),
    relatedLegislation: '4857 sayılı İş Kanunu',
    retentionPeriod: 'İş ilişkisi bitiminden sonra 10 yıl',
    recipients: opt('recipients', 0),
    administrativeMeasures: opt('administrativeMeasures', 0, 1),
    technicalMeasures: opt('technicalMeasures', 0, 1, 2),
    ...extra,
  });
  for (const e of [
    entry('İnsan Kaynakları', 'Çalışan Özlük Dosyaları', 'Kimlik', { personalData: 'Ad soyad, T.C. kimlik no, doğum tarihi' }),
    entry('İnsan Kaynakları', 'Çalışan Özlük Dosyaları', 'İletişim', { personalData: 'Adres, cep telefonu, e-posta' }),
    entry('İnsan Kaynakları', 'Çalışan Sağlık Bilgileri', 'Sağlık Bilgileri', {
      specialCategoryData: 'İşe giriş sağlık raporu, kan grubu',
      legalBases: [],
    }),
    entry('Muhasebe', 'Bordro', 'Finans', { personalData: 'Banka hesap no, maaş bilgisi', storageMedium: 'digital' }),
    entry('İdari', 'Kamera Kayıtları', 'Fiziksel Mekân Güvenliği', {
      personalData: 'Bina giriş kamera görüntüleri',
      retentionPeriod: '30 gün',
      storageLocation: 'Kayıt cihazı (güvenlik odası)',
      dataSubjectGroups: opt('dataSubjectGroups', 1, 4),
    }),
    // Eksik satır: zorunlu olmayan sütunlar boş, "eksik" uyarısı denemesi için.
    { department: 'Satış', activity: 'Müşteri Teklifleri', dataCategory: 'Müşteri İşlem' },
  ]) {
    await inventory.create(orgA, sorumlu, e);
  }
  await inventory.create(orgB, tek, entry('İdari', 'Çalışan Özlük Dosyaları', 'Kimlik'));

  // Sözleşmeler: biri 20 gün içinde bitiyor, biri süresi geçmiş ama aktif görünüyor.
  for (const c of [
    { partyName: 'Bordro Yazılım A.Ş.', type: 'processor_confidentiality', startDate: day(-200), endDate: day(20), status: 'active', contactName: 'Ayşe Kaya', contactEmail: 'ayse@bordro.example.com', description: 'Bordro hizmeti veri işleyen sözleşmesi' },
    { partyName: 'Güvenlik Hizmetleri Ltd.', type: 'processor_confidentiality', startDate: day(-400), endDate: day(-10), status: 'active', contactName: 'Mert Can', contactPhone: '0212 555 33 33' },
    { partyName: 'Ahmet Demir', type: 'employment', startDate: day(-700), status: 'active' },
    { partyName: 'Ahmet Demir', type: 'employee_confidentiality', startDate: day(-700), status: 'active', signedCopyUrl: 'https://drive.example.com/sozlesmeler/ahmet-demir-gizlilik.pdf' },
    { partyName: 'Web sitesi ziyaretçileri', type: 'privacy_notice', startDate: day(-30), status: 'draft' },
  ] as const) {
    await contracts.create(orgA, sorumlu, c);
  }
  await contracts.create(orgB, tek, { partyName: 'Muhasebe Bürosu', type: 'processor_confidentiality', startDate: day(-100), endDate: day(265), status: 'active' });

  // Görevler
  await tasks.create(orgA, sorumlu, { type: 'general', title: 'Envanterdeki eksik satırı tamamla', assigneeId: sorumlu, dueDate: day(3), reminderDays: [1] });
  await tasks.create(orgA, sorumlu, { type: 'general', title: 'Kamera kayıtları imha kontrolü', assigneeId: sorumlu, dueDate: day(30), reminderDays: [7, 1], recurrenceMonths: 1 });

  // Çalışanlar: biri e-postasız, biri işten çıkmış.
  const people: [string, string, string | null, string | null][] = [
    ['Ayşe', 'Yılmaz', 'ayse.yilmaz@test.local', null],
    ['Mehmet', 'Kaya', 'mehmet.kaya@test.local', null],
    ['Zeynep', 'Demir', 'zeynep.demir@test.local', null],
    ['Can', 'Öztürk', 'can.ozturk@test.local', null],
    ['Elif', 'Şahin', 'elif.sahin@test.local', null],
    ['Burak', 'Çelik', null, null],
    ['Deniz', 'Arslan', 'deniz.arslan@test.local', day(-15)],
    ['Gül', 'Aydın', 'gul.aydin@test.local', null],
  ];
  const employeeIds: string[] = [];
  for (const [i, [firstName, lastName, email, terminationDate]] of people.entries()) {
    const e = await employees.create(admin.id, orgA, {
      nationalId: nationalId(`1000000${String(i + 10).padStart(2, '0')}`),
      firstName,
      lastName,
      hireDate: day(-365 - i * 30),
      terminationDate,
      phone: `05325550${String(i + 10).padStart(3, '0')}`,
      email,
    });
    employeeIds.push(e.id);
  }
  for (const [i, [firstName, lastName]] of [['Okan', 'Tekin'], ['Seda', 'Koç']].entries()) {
    await employees.create(admin.id, orgB, {
      nationalId: nationalId(`2000000${String(i + 10).padStart(2, '0')}`),
      firstName,
      lastName,
      hireDate: day(-100),
      terminationDate: null,
      phone: null,
      email: `${firstName.toLocaleLowerCase('tr')}.${lastName.toLocaleLowerCase('tr').replace('ç', 'c')}@test.local`,
    });
  }

  // Eğitimci ve yayında bir eğitim; A'nın ilk 4 çalışanına gönderildi.
  const trainer = await trainers.create(admin.id, {
    nationalId: nationalId('300000010'),
    firstName: 'Ece',
    lastName: 'Eğitimci',
    hireDate: null,
    terminationDate: null,
    phone: null,
    email: 'egitimci@test.local',
  });
  const training = await trainings.create(admin.id, {
    name: 'KVKK Temel Farkındalık Eğitimi (test)',
    description: 'Test verisi: deneme amaçlı kısa bir eğitim.',
    trainerId: trainer.id,
    passScore: 70,
  });
  for (const [title, content] of [
    ['Kişisel veri nedir?', '<p>Kimliği belirli veya belirlenebilir gerçek kişiye ilişkin her türlü bilgi kişisel veridir. (Test içeriği)</p>'],
    ['Özel nitelikli kişisel veriler', '<p>Sağlık, biyometrik veri, din, sendika üyeliği gibi veriler özel niteliklidir. (Test içeriği)</p>'],
    ['Çalışan olarak sorumluluklarımız', '<p>Kişisel verileri yalnızca işimiz için gerektiği kadar kullanırız. (Test içeriği)</p>'],
  ]) {
    await trainings.addTopic(admin.id, training.id, { title, content, minReadSeconds: 10 });
  }
  const questions = [
    ['Aşağıdakilerden hangisi kişisel veridir?', 'Hava durumu', 'T.C. kimlik numarası', 'Şirketin kuruluş yılı', 'Döviz kuru', 'B'],
    ['Hangisi özel nitelikli kişisel veridir?', 'Telefon numarası', 'Adres', 'Kan grubu', 'E-posta adresi', 'C'],
    ['Kişisel veriyi kimlerle paylaşabiliriz?', 'Herkesle', 'Sosyal medyada', 'Yalnızca işi gereği yetkili kişilerle', 'Arkadaşlarımızla', 'C'],
  ] as const;
  for (const testType of ['pre', 'post'] as const) {
    for (const [i, [text, optionA, optionB, optionC, optionD, correctOption]] of questions.entries()) {
      await trainings.addQuestion(admin.id, training.id, { testType, text, optionA, optionB, optionC, optionD, correctOption, points: i === 0 ? 34 : 33 });
    }
  }
  await trainings.update(admin.id, training.id, { status: 'active' });
  const group = await groups.create(admin.id, { organizationId: orgA, trainingId: training.id, name: 'Merkez ofis - Ekim', employeeIds: employeeIds.slice(0, 4) });
  await groups.send(admin.id, group.id);
  // Gruba girmeyen çalışanlara yalnızca doküman okuması için portal erişimi.
  await portalDocs.sendAccess(admin.id, orgA);
  // İşten çıkan çalışanın eski portal hesabı: girebilir ama dokümanları göremez.
  await app.get(PortalAuthService).issueCredentials('deniz.arslan@test.local');

  // Herkes aynı test şifresiyle hemen girebilsin.
  const hash = await hashPassword(TEST_PASSWORD);
  const accounts = ['sorumlu.a@test.local', 'yonetici.a@test.local', 'tek.b@test.local', 'egitimci@test.local'];
  await db.update(users).set({ passwordHash: hash }).where(inArray(sql`lower(${users.email})`, accounts));
  await db
    .update(trainingAccounts)
    .set({ passwordHash: hash, mustChangePassword: false })
    .where(sql`lower(${trainingAccounts.email}) like '%@test.local'`);

  console.log(`Test verisi yüklendi. Tüm test hesaplarının şifresi: ${TEST_PASSWORD}`);
  console.log('Müşteri ekranı (http://localhost:3000): sorumlu.a@test.local (KVKK Sorumlusu), yonetici.a@test.local (Yönetici), tek.b@test.local (Sorumlu + Yönetici)');
  console.log('Eğitimci: egitimci@test.local · Eğitim Portalı (http://localhost:3000/egitim): ayse.yilmaz@test.local, gul.aydin@test.local, deniz.arslan@test.local (işten çıkmış)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
