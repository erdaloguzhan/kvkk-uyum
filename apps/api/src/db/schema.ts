import { sql } from 'drizzle-orm';
import { decryptField, encryptField } from '../common/field-crypto';
import {
  AnyPgColumn,
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const id = () => uuid('id').primaryKey().defaultRandom();
const bytea = customType<{ data: Buffer }>({ dataType: () => 'bytea' });
const textList = (name: string) => text(name).array().notNull().default(sql`'{}'::text[]`);
/** Uygulamada düz metin, veritabanında AES-256-GCM ile şifreli tutulan alan (bkz. common/field-crypto). */
const encryptedText = customType<{ data: string; driverData: string }>({
  dataType: () => 'text',
  toDriver: (value) => encryptField(value),
  fromDriver: (value) => decryptField(value),
});
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const users = pgTable(
  'users',
  {
    id: id(),
    email: text('email').notNull(),
    fullName: text('full_name').notNull(),
    passwordHash: text('password_hash').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    isPlatformAdmin: boolean('is_platform_admin').notNull().default(false),
    failedLoginCount: integer('failed_login_count').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('users_email_unique').on(sql`lower(${t.email})`)],
);

export const organizations = pgTable('organizations', {
  id: id(),
  name: text('name').notNull(),
  address: text('address'),
  email: text('email'),
  phone: text('phone'),
  kepAddress: text('kep_address'),
  authorizedPerson: text('authorized_person'),
  taxNumber: text('tax_number'),
  website: text('website'),
  licenseStatus: text('license_status', { enum: ['trial', 'active', 'expired'] })
    .notNull()
    .default('trial'),
  licenseExpiresAt: timestamp('license_expires_at', { withTimezone: true }),
  setupCompletedAt: timestamp('setup_completed_at', { withTimezone: true }),
  createdAt: createdAt(),
});

export const roles = pgTable(
  'roles',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    name: text('name').notNull(),
    permissions: text('permissions').array().notNull().default(sql`'{}'::text[]`),
    isSystem: boolean('is_system').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('roles_org_key_unique').on(t.organizationId, t.key)],
);

export const memberships = pgTable(
  'memberships',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id),
    status: text('status', { enum: ['active', 'disabled'] }).notNull().default('active'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('memberships_user_org_unique').on(t.userId, t.organizationId)],
);

/** Giriş sırasında gönderilen tek kullanımlık doğrulama kodları. */
export const loginChallenges = pgTable('login_challenges', {
  id: id(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  codeHash: text('code_hash').notNull(),
  attempts: integer('attempts').notNull().default(0),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  createdAt: createdAt(),
});

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('refresh_tokens_hash_unique').on(t.tokenHash)],
);

/** Şifre belirleme / sıfırlama bağlantıları (davet edilen kullanıcılar da bunu kullanır). */
export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('password_reset_tokens_hash_unique').on(t.tokenHash)],
);

/** Sistem hareketlerinin tarihçesi. */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: id(),
    organizationId: uuid('organization_id').references(() => organizations.id, {
      onDelete: 'set null',
    }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    entityType: text('entity_type'),
    entityId: text('entity_id'),
    ip: text('ip'),
    userAgent: text('user_agent'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [index('audit_logs_org_created_idx').on(t.organizationId, t.createdAt)],
);

/**
 * Platform yöneticisinin yönettiği ana (master) doküman şablonu. İlk kurulumda @kvkk/shared
 * DOCUMENT_TEMPLATES kataloğu ve content/ klasöründeki dosyalarla doldurulur.
 */
export const documentTemplates = pgTable('document_templates', {
  code: text('code').primaryKey(),
  title: text('title').notNull(),
  category: text('category', { enum: ['policy', 'procedure', 'form', 'notice', 'contract'] }).notNull(),
  optional: boolean('optional').notNull().default(false),
  createdAt: createdAt(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Ana şablonun sürümleri. Yayınlanan sürüm `effectiveFrom` anından itibaren geçerlidir;
 * kuruluşlar o andan sonra oluşturdukları/güncelledikleri dokümanları bu sürümden alır.
 */
export const templateVersions = pgTable(
  'template_versions',
  {
    id: id(),
    templateCode: text('template_code')
      .notNull()
      .references(() => documentTemplates.code, { onDelete: 'cascade', onUpdate: 'cascade' }),
    versionNo: integer('version_no').notNull(),
    status: text('status', { enum: ['draft', 'published'] }).notNull().default('draft'),
    fileName: text('file_name').notNull(),
    content: bytea('content').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    sha256: text('sha256').notNull(),
    note: text('note'),
    /** Yayın (yürürlük) tarihi; bu andan itibaren yeni dokümanlar bu sürümden üretilir. */
    effectiveFrom: timestamp('effective_from', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    publishedBy: uuid('published_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (t) => [
    uniqueIndex('template_versions_code_version_unique').on(t.templateCode, t.versionNo),
    index('template_versions_code_status_idx').on(t.templateCode, t.status, t.effectiveFrom),
  ],
);

/** Kuruluşa ait doküman (politika, prosedür, form, aydınlatma metni, sözleşme). */
export const documents = pgTable(
  'documents',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    /** Şablondan oluşturulduysa şablon kodu (ör. POL-010). */
    templateCode: text('template_code'),
    code: text('code').notNull(),
    title: text('title').notNull(),
    category: text('category', { enum: ['policy', 'procedure', 'form', 'notice', 'contract'] }).notNull(),
    publishedVersionId: uuid('published_version_id').references((): AnyPgColumn => documentVersions.id, {
      onDelete: 'set null',
    }),
    /** Yayınlanmış sürüm kuruluş çalışanlarına eğitim portalında gösterilir. */
    employeeVisible: boolean('employee_visible').notNull().default(true),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('documents_org_code_unique').on(t.organizationId, t.code)],
);

/**
 * Dokümanın sürümleri. Her sürüm dosyanın kendisini taşır ve değiştirilmez;
 * değişiklik her zaman yeni sürüm olarak eklenir.
 */
export const documentVersions = pgTable(
  'document_versions',
  {
    id: id(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    versionNo: integer('version_no').notNull(),
    status: text('status', { enum: ['draft', 'published', 'superseded'] }).notNull().default('draft'),
    /** template: şablondan kuruluş profiliyle üretildi; upload: kullanıcı düzenleyip yükledi. */
    source: text('source', { enum: ['template', 'upload'] }).notNull(),
    fileName: text('file_name').notNull(),
    content: bytea('content').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    sha256: text('sha256').notNull(),
    /** Henüz desteklenmediği için boş bırakılan yer tutucular (ör. kurum.logo). */
    unfilledPlaceholders: text('unfilled_placeholders').array().notNull().default(sql`'{}'::text[]`),
    note: text('note'),
    /**
     * Sürümün dayandığı ana şablon sürümü. Yüklenen sürümler bir öncekinden devralır.
     * Boşsa (bu alan eklenmeden önce üretilmiş sürümler) şablonun ilk sürümüne dayanır.
     */
    templateVersionId: uuid('template_version_id').references(() => templateVersions.id, { onDelete: 'set null' }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    publishedBy: uuid('published_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (t) => [uniqueIndex('document_versions_doc_version_unique').on(t.documentId, t.versionNo)],
);

/**
 * Kişisel veri envanteri satırı (TBL-010'un bir satırı): bir departmanın bir faaliyetinde
 * işlenen bir veri kategorisi. Sütunlar @kvkk/shared INVENTORY_COLUMNS ile aynı sıradadır.
 */
export const inventoryEntries = pgTable(
  'inventory_entries',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    department: text('department').notNull(),
    activity: text('activity').notNull(),
    dataCategory: text('data_category').notNull(),
    personalData: text('personal_data'),
    specialCategoryData: text('special_category_data'),
    purposes: textList('purposes'),
    storageMedium: text('storage_medium', { enum: ['physical', 'digital', 'both'] }),
    storageLocation: text('storage_location'),
    dataSubjectGroups: textList('data_subject_groups'),
    legalBases: textList('legal_bases'),
    relatedLegislation: text('related_legislation'),
    retentionPeriod: text('retention_period'),
    recipients: textList('recipients'),
    foreignTransfers: text('foreign_transfers'),
    administrativeMeasures: textList('administrative_measures'),
    technicalMeasures: textList('technical_measures'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('inventory_entries_org_department_idx').on(t.organizationId, t.department)],
);

/**
 * İş akışı görevi: bir kişiye atanmış, son tarihi olan iş (doküman gözden geçirme, periyodik imha vb.).
 * Tekrarlayan görev tamamlandığında bir sonraki dönemin görevi `previousTaskId` ile bağlanarak açılır.
 */
export const tasks = pgTable(
  'tasks',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    type: text('type', {
      enum: ['general', 'document_review', 'inventory_review', 'data_destruction', 'approval'],
    }).notNull(),
    title: text('title').notNull(),
    description: text('description'),
    assigneeId: uuid('assignee_id')
      .notNull()
      .references(() => users.id),
    /** Son tarih (gün; kuruluşun saat dilimine göre). */
    dueDate: date('due_date', { mode: 'string' }).notNull(),
    /** Son tarihten kaç gün önce hatırlatma gönderileceği. */
    reminderDays: integer('reminder_days').array().notNull().default(sql`'{}'::integer[]`),
    /** Tekrarlama aralığı (ay); boşsa tek seferlik. */
    recurrenceMonths: integer('recurrence_months'),
    status: text('status', { enum: ['open', 'done', 'cancelled'] }).notNull().default('open'),
    /** Bağlı kayıt (ör. gözden geçirilecek doküman). */
    entityType: text('entity_type', { enum: ['document', 'inventory_entry', 'inventory_approval'] }),
    entityId: uuid('entity_id'),
    previousTaskId: uuid('previous_task_id').references((): AnyPgColumn => tasks.id, { onDelete: 'set null' }),
    completionNote: text('completion_note'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    completedBy: uuid('completed_by').references(() => users.id, { onDelete: 'set null' }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('tasks_org_status_due_idx').on(t.organizationId, t.status, t.dueDate),
    index('tasks_assignee_status_idx').on(t.assigneeId, t.status),
  ],
);

/** Doküman sürümünün yayınlanması için onay talebi. Onaylayana `approval` türünde görev açılır. */
export const approvalRequests = pgTable(
  'approval_requests',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    versionId: uuid('version_id')
      .notNull()
      .references(() => documentVersions.id, { onDelete: 'cascade' }),
    taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'set null' }),
    requestedBy: uuid('requested_by').references(() => users.id, { onDelete: 'set null' }),
    approverId: uuid('approver_id')
      .notNull()
      .references(() => users.id),
    status: text('status', { enum: ['pending', 'approved', 'rejected', 'cancelled'] }).notNull().default('pending'),
    note: text('note'),
    decisionNote: text('decision_note'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decidedBy: uuid('decided_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [
    // Bir sürüm için aynı anda tek bekleyen onay talebi olabilir.
    uniqueIndex('approval_requests_pending_version_unique')
      .on(t.versionId)
      .where(sql`${t.status} = 'pending'`),
    index('approval_requests_org_status_idx').on(t.organizationId, t.status),
  ],
);

/** Envanter satırının onay için saklanan hali (kimlik ve tarih alanları hariç). */
export type InventorySnapshotEntry = Omit<
  typeof inventoryEntries.$inferSelect,
  'organizationId' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
>;

/** Son onaylanan envantere göre bir satırdaki değişiklik. */
export interface InventoryChange {
  entryId: string;
  kind: 'added' | 'updated' | 'deleted';
  department: string;
  activity: string;
  dataCategory: string;
  /** Güncellenen satırda değişen alanlar ve önceki/yeni değerleri. */
  fields?: { field: string; before: unknown; after: unknown }[];
}

/**
 * Veri envanterindeki değişikliklerin onayı. Sorumlu, son onaydan bu yana yapılan değişiklikleri Yöneticiye
 * gönderir; talep o anki envanterin tamamını (`snapshot`) ve değişiklik listesini (`changes`) saklar.
 * Onaylanan talebin `snapshot`'ı bir sonraki değişiklik listesinin karşılaştırma tabanıdır.
 */
export const inventoryApprovals = pgTable(
  'inventory_approvals',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'set null' }),
    requestedBy: uuid('requested_by').references(() => users.id, { onDelete: 'set null' }),
    approverId: uuid('approver_id')
      .notNull()
      .references(() => users.id),
    status: text('status', { enum: ['pending', 'approved', 'rejected', 'cancelled'] }).notNull().default('pending'),
    note: text('note'),
    decisionNote: text('decision_note'),
    snapshot: jsonb('snapshot').$type<InventorySnapshotEntry[]>().notNull(),
    changes: jsonb('changes').$type<InventoryChange[]>().notNull(),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decidedBy: uuid('decided_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [
    // Kuruluşta aynı anda tek bekleyen envanter onay talebi olabilir.
    uniqueIndex('inventory_approvals_pending_org_unique')
      .on(t.organizationId)
      .where(sql`${t.status} = 'pending'`),
    index('inventory_approvals_org_created_idx').on(t.organizationId, t.createdAt),
  ],
);

/**
 * Kullanıcıya gösterilen bildirimler (alarmlar). Aynı alarm iki kez üretilmesin diye
 * zamanlanmış alarmlar `dedupeKey` taşır; birden çok sunucu aynı anda çalışsa da tek kayıt oluşur.
 */
export const notifications = pgTable(
  'notifications',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind', {
      enum: [
        'task_assigned',
        'task_reminder',
        'task_due_today',
        'task_overdue',
        'approval_requested',
        'approval_decided',
      ],
    }).notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'cascade' }),
    approvalRequestId: uuid('approval_request_id').references(() => approvalRequests.id, { onDelete: 'cascade' }),
    dedupeKey: text('dedupe_key'),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    unique('notifications_dedupe_key_unique').on(t.dedupeKey),
    index('notifications_user_org_created_idx').on(t.userId, t.organizationId, t.createdAt),
  ],
);

/** Kuruluşun bir kişi veya kurumla yaptığı sözleşme ve sözleşmedeki ilgili kişinin iletişim bilgileri. */
export const contracts = pgTable(
  'contracts',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    /** Sözleşme yapılan kişinin adı veya kurumun ünvanı. */
    partyName: text('party_name').notNull(),
    /** Eski türlerden yeni karşılığı olmayan kayıtlarda boş (0008); yeni kayıtlarda API zorunlu tutar. */
    type: text('type', { enum: ['employment', 'employee_confidentiality', 'processor_confidentiality', 'privacy_notice', 'explicit_consent'] }),
    startDate: date('start_date', { mode: 'string' }),
    /** Boşsa belirsiz süreli. */
    endDate: date('end_date', { mode: 'string' }),
    status: text('status', { enum: ['draft', 'active', 'expired', 'terminated'] }).notNull().default('draft'),
    contactName: text('contact_name'),
    contactPhone: text('contact_phone'),
    contactEmail: text('contact_email'),
    description: text('description'),
    /** Islak imzalı sözleşmenin taranmış kopyasının bağlantısı (http/https). */
    signedCopyUrl: text('signed_copy_url'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('contracts_org_status_idx').on(t.organizationId, t.status)],
);

// ---------------------------------------------------------------------------------------------
// Uzaktan eğitim modülü
// ---------------------------------------------------------------------------------------------

/** Kuruluşun (müşterinin) çalışanı. Eğitim gruplarının katılımcıları bu listeden seçilir. */
export const employees = pgTable(
  'employees',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    /** Şifreli. Arama ve tekillik `nationalIdHash` ile yapılır. */
    nationalId: encryptedText('national_id').notNull(),
    nationalIdHash: text('national_id_hash').notNull(),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    hireDate: date('hire_date', { mode: 'string' }),
    terminationDate: date('termination_date', { mode: 'string' }),
    /** 05XXXXXXXXX biçiminde. Eğitim Portalı kullanıcı adıdır; yalnızca bir kişiye (T.C. no) ait olabilir. */
    phone: text('phone'),
    /** Portal hesabı ve e-postalar (geçici şifre, şifre sıfırlama) bu adrese bağlıdır. */
    email: text('email'),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('employees_org_national_id_hash_unique').on(t.organizationId, t.nationalIdHash),
    index('employees_phone_idx').on(t.phone),
  ],
);

/**
 * Eğitimci. Yönetim paneline kendi kullanıcı hesabıyla (e-posta + şifre + doğrulama kodu) girer ve
 * yalnızca eğitim bölümünü görür. E-posta ve şifre `users` tablosundadır.
 */
export const trainers = pgTable(
  'trainers',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Şifreli. Arama ve tekillik `nationalIdHash` ile yapılır. */
    nationalId: encryptedText('national_id').notNull(),
    nationalIdHash: text('national_id_hash').notNull(),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    hireDate: date('hire_date', { mode: 'string' }),
    terminationDate: date('termination_date', { mode: 'string' }),
    phone: text('phone'),
    /** Sertifikada adın altında yazar (ör. "KVKK Danışmanı"). */
    title: text('title'),
    /** Sertifikadaki imza görseli (PNG veya JPEG). */
    signature: bytea('signature'),
    signatureMime: text('signature_mime'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('trainers_user_unique').on(t.userId), uniqueIndex('trainers_national_id_hash_unique').on(t.nationalIdHash)],
);

/** Eğitim (ör. "KVKK Farkındalık Eğitimi"). Alt konular, ön test ve son test soruları buna bağlıdır. */
export const trainings = pgTable('trainings', {
  id: id(),
  name: text('name').notNull(),
  description: text('description'),
  /** Son testte başarılı sayılmak için gereken en düşük not. */
  passScore: integer('pass_score').notNull().default(70),
  /** draft: hazırlanıyor; active: içerik ve sorular tamam, gruplara atanabilir. */
  status: text('status', { enum: ['draft', 'active'] }).notNull().default('draft'),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Eğitimin alt konusu: katılımcıya bir sayfa olarak gösterilen ders anlatımı (metin ve görseller). */
export const trainingTopics = pgTable(
  'training_topics',
  {
    id: id(),
    trainingId: uuid('training_id')
      .notNull()
      .references(() => trainings.id, { onDelete: 'cascade' }),
    sortOrder: integer('sort_order').notNull(),
    title: text('title').notNull(),
    /** Ders anlatımı (Markdown: başlık, liste, kalın/italik, bağlantı ve görsel). */
    content: text('content').notNull().default(''),
    /** Bu süre (saniye) dolmadan katılımcı sonraki konuya geçemez. */
    minReadSeconds: integer('min_read_seconds').notNull().default(60),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('training_topics_training_idx').on(t.trainingId, t.sortOrder)],
);

/** Ders anlatımlarında kullanılan görseller. */
export const trainingMedia = pgTable('training_media', {
  id: id(),
  fileName: text('file_name').notNull(),
  mimeType: text('mime_type').notNull(),
  content: bytea('content').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
});

/**
 * Sınav sorusu. Ön test ve son test aynı tabloda `testType` ile ayrılır; bir eğitimin bir test türündeki
 * soruları o testin sınavıdır ve puanları toplamı 100 olmalıdır.
 */
export const trainingQuestions = pgTable(
  'training_questions',
  {
    id: id(),
    trainingId: uuid('training_id')
      .notNull()
      .references(() => trainings.id, { onDelete: 'cascade' }),
    testType: text('test_type', { enum: ['pre', 'post'] }).notNull(),
    sortOrder: integer('sort_order').notNull(),
    text: text('text').notNull(),
    optionA: text('option_a').notNull(),
    optionB: text('option_b').notNull(),
    optionC: text('option_c').notNull(),
    optionD: text('option_d').notNull(),
    correctOption: text('correct_option', { enum: ['A', 'B', 'C', 'D'] }).notNull(),
    points: integer('points').notNull(),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('training_questions_training_idx').on(t.trainingId, t.testType, t.sortOrder)],
);

/** Eğitim grubu: bir kuruluşun seçilen çalışanlarına atanan bir eğitim. */
export const trainingGroups = pgTable(
  'training_groups',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    trainingId: uuid('training_id')
      .notNull()
      .references(() => trainings.id),
    name: text('name').notNull(),
    /** Grubun eğitimcisi; sertifikada imza yerinde yazar (25.10.2026: eğitimden gruba taşındı). */
    trainerId: uuid('trainer_id').references(() => trainers.id, { onDelete: 'set null' }),
    /** Eğitimin başlatıldığı (katılımcılara ilk bildirimin gönderildiği) an. Boşsa henüz başlatılmadı. */
    assignedAt: timestamp('assigned_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [index('training_groups_org_idx').on(t.organizationId)],
);

/**
 * Eğitim portalı hesabı. Kullanıcı adı e-posta adresidir; aynı kişi birden çok kuruluşta çalışan olarak
 * kayıtlıysa tek hesapla hepsindeki eğitimlerini görür.
 */
export const trainingAccounts = pgTable(
  'training_accounts',
  {
    id: id(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    /** Geçici şifreyle açılan hesapta ilk girişte şifre değiştirilmeden eğitime geçilemez. */
    mustChangePassword: boolean('must_change_password').notNull().default(true),
    failedLoginCount: integer('failed_login_count').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('training_accounts_email_unique').on(sql`lower(${t.email})`)],
);

/** Eğitim portalı "şifremi unuttum" bağlantıları. */
export const trainingAccountTokens = pgTable(
  'training_account_tokens',
  {
    id: id(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => trainingAccounts.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('training_account_tokens_hash_unique').on(t.tokenHash)],
);

/** Eğitim grubundaki katılımcı ve eğitimdeki ilerlemesi. */
export const trainingParticipants = pgTable(
  'training_participants',
  {
    id: id(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => trainingGroups.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id),
    /** Eğitim bağlantısı ve giriş bilgilerinin gönderildiği an. */
    sentAt: timestamp('sent_at', { withTimezone: true }),
    /** Katılımcının eğitime ilk başladığı an. */
    startedAt: timestamp('started_at', { withTimezone: true }),
    /** Son testi başarıyla tamamladığı an. */
    completedAt: timestamp('completed_at', { withTimezone: true }),
    /**
     * Konu ilerlemesi yalnızca bir oturum içinde geçerlidir: katılımcı eğitimi bitirmeden çıkar ve yeniden
     * girerse (yeni oturum) eğitim ilk konudan başlar.
     */
    progressSessionId: text('progress_session_id'),
    currentTopicIndex: integer('current_topic_index').notNull().default(0),
    topicStartedAt: timestamp('topic_started_at', { withTimezone: true }),
    topicsCompletedAt: timestamp('topics_completed_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('training_participants_group_employee_unique').on(t.groupId, t.employeeId),
    index('training_participants_employee_idx').on(t.employeeId),
  ],
);

/** Tamamlanan sınav (ön test veya son test) ve notu. Sınav bitince tek seferde oluşturulur. */
export const trainingExamAttempts = pgTable(
  'training_exam_attempts',
  {
    id: id(),
    participantId: uuid('participant_id')
      .notNull()
      .references(() => trainingParticipants.id, { onDelete: 'cascade' }),
    testType: text('test_type', { enum: ['pre', 'post'] }).notNull(),
    /** Doğru cevaplanan soruların puanları toplamı. */
    score: integer('score').notNull(),
    /** Son testte geçme notuna ulaşıldı mı; ön testte boş (sonucu etkilemez). */
    passed: boolean('passed'),
    completedAt: timestamp('completed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('training_exam_attempts_participant_idx').on(t.participantId, t.testType),
    // Ön test bir kez çözülür.
    uniqueIndex('training_exam_attempts_single_pre_unique')
      .on(t.participantId)
      .where(sql`${t.testType} = 'pre'`),
  ],
);

/** Sınavdaki her sorunun cevabı ve aldığı puan (doğruysa sorunun puanı, yanlışsa 0). */
export const trainingExamAnswers = pgTable(
  'training_exam_answers',
  {
    id: id(),
    attemptId: uuid('attempt_id')
      .notNull()
      .references(() => trainingExamAttempts.id, { onDelete: 'cascade' }),
    questionId: uuid('question_id')
      .notNull()
      .references(() => trainingQuestions.id),
    answer: text('answer', { enum: ['A', 'B', 'C', 'D'] }).notNull(),
    isCorrect: boolean('is_correct').notNull(),
    points: integer('points').notNull(),
  },
  (t) => [uniqueIndex('training_exam_answers_attempt_question_unique').on(t.attemptId, t.questionId)],
);

// ---------------------------------------------------------------------------------------------
// Destek talepleri
// ---------------------------------------------------------------------------------------------

/** Kuruluş kullanıcısının açtığı destek talebi. Yazışma support_messages tablosundadır. */
export const supportTickets = pgTable(
  'support_tickets',
  {
    id: id(),
    /** Kullanıcıya gösterilen talep numarası (#1001...). */
    number: integer('number').notNull().generatedAlwaysAsIdentity({ startWith: 1001 }),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    subject: text('subject').notNull(),
    category: text('category', {
      enum: ['usage', 'technical', 'documents', 'inventory', 'training', 'account', 'other'],
    }).notNull(),
    status: text('status', { enum: ['open', 'answered', 'closed'] }).notNull().default('open'),
    /** Talepten sorumlu platform yöneticisi. */
    assigneeId: uuid('assignee_id').references(() => users.id, { onDelete: 'set null' }),
    /** Destek ekibinin ilk yanıt zamanı (yanıt süresi ölçümü). */
    firstResponseAt: timestamp('first_response_at', { withTimezone: true }),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('support_tickets_number_unique').on(t.number),
    index('support_tickets_org_created_idx').on(t.organizationId, t.createdAt),
    index('support_tickets_status_last_idx').on(t.status, t.lastMessageAt),
  ],
);

export const supportMessages = pgTable(
  'support_messages',
  {
    id: id(),
    ticketId: uuid('ticket_id')
      .notNull()
      .references(() => supportTickets.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
    /** Destek ekibinin (platform yöneticisi) yanıtı. */
    isStaff: boolean('is_staff').notNull(),
    body: text('body').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('support_messages_ticket_created_idx').on(t.ticketId, t.createdAt)],
);

/** Mesaj ekleri (ekran görüntüsü, PDF). */
export const supportAttachments = pgTable(
  'support_attachments',
  {
    id: id(),
    messageId: uuid('message_id')
      .notNull()
      .references(() => supportMessages.id, { onDelete: 'cascade' }),
    fileName: text('file_name').notNull(),
    mimeType: text('mime_type').notNull(),
    size: integer('size').notNull(),
    content: bytea('content').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('support_attachments_message_idx').on(t.messageId)],
);

/**
 * Çalışanın eğitim portalında yayınlanmış bir doküman sürümünü sonuna kadar okuyup "Okudum, anladım."
 * onayı verdiği kayıt. Doküman yeni sürümle yayınlanırsa çalışan yeni sürümü ayrıca onaylar.
 */
export const documentReads = pgTable(
  'document_reads',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    versionId: uuid('version_id')
      .notNull()
      .references(() => documentVersions.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    ip: text('ip'),
    userAgent: text('user_agent'),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('document_reads_version_employee_unique').on(t.versionId, t.employeeId),
    index('document_reads_document_idx').on(t.documentId),
  ],
);
