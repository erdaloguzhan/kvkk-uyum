import { sql } from 'drizzle-orm';
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
    entityType: text('entity_type', { enum: ['document', 'inventory_entry'] }),
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
