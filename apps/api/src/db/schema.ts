import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const id = () => uuid('id').primaryKey().defaultRandom();
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
