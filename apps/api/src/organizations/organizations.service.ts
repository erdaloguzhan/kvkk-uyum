import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ORG_ADMIN_ROLE_KEY, SYSTEM_ROLES } from '@kvkk/shared';
import { eq, getTableColumns } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';
import { AppConfig, CONFIG } from '../config';
import { Database, InjectDb } from '../db/db.module';
import { memberships, organizations, roles } from '../db/schema';

export interface OrganizationProfile {
  name: string;
  address?: string | null;
  email?: string | null;
  phone?: string | null;
  kepAddress?: string | null;
  authorizedPerson?: string | null;
  taxNumber?: string | null;
  website?: string | null;
}

/** Kurulum sihirbazının tamamlanması için dolu olması gereken alanlar. */
const REQUIRED_FOR_SETUP: (keyof OrganizationProfile)[] = [
  'name',
  'address',
  'email',
  'phone',
  'authorizedPerson',
  'taxNumber',
];

/** Yanıtlarda dönen kuruluş alanları: logo dosyası ayrı uçtan verilir, yerine `logoUpdatedAt` döner. */
const { logo: _logo, logoMime: _logoMime, ...ORG_COLUMNS } = getTableColumns(organizations);

/** Firma logosu; menüde ve PDF'lerde sorunsuz gösterilebilmesi için yalnızca PNG veya JPEG. */
const LOGO_TYPES: Record<string, (b: Buffer) => boolean> = {
  'image/png': (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
};

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectDb() private readonly db: Database,
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly audit: AuditService,
  ) {}

  /**
   * Kuruluşu oluşturur, sabit rolleri ekler ve `userId` verilirse onu "Sorumlu + Yönetici" yapar.
   * `actorId`: işlemi yapan (platform yöneticisi); verilmezse kullanıcının kendisi.
   */
  async create(userId: string | null, profile: OrganizationProfile, actorId = userId) {
    const org = await this.db.transaction(async (tx) => {
      const [org] = await tx
        .insert(organizations)
        .values({
          ...profile,
          licenseStatus: 'trial',
          licenseExpiresAt: new Date(Date.now() + this.config.trialDays * 24 * 60 * 60 * 1000),
        })
        .returning(ORG_COLUMNS);
      const createdRoles = await tx
        .insert(roles)
        .values(
          SYSTEM_ROLES.map((r) => ({
            organizationId: org.id,
            key: r.key,
            name: r.name,
            permissions: r.permissions,
            isSystem: true,
          })),
        )
        .returning({ id: roles.id, key: roles.key });
      if (userId) {
        const adminRole = createdRoles.find((r) => r.key === ORG_ADMIN_ROLE_KEY)!;
        await tx.insert(memberships).values({ userId, organizationId: org.id, roleId: adminRole.id });
      }
      return org;
    });
    await this.audit.record({
      action: 'organization.created',
      organizationId: org.id,
      userId: actorId,
      entityType: 'organization',
      entityId: org.id,
    });
    return org;
  }

  async get(orgId: string) {
    const [org] = await this.db.select(ORG_COLUMNS).from(organizations).where(eq(organizations.id, orgId));
    return org;
  }

  async update(orgId: string, userId: string, changes: Partial<OrganizationProfile>) {
    const [org] = await this.db
      .update(organizations)
      .set(changes)
      .where(eq(organizations.id, orgId))
      .returning(ORG_COLUMNS);
    await this.audit.record({
      action: 'organization.updated',
      organizationId: orgId,
      userId,
      entityType: 'organization',
      entityId: orgId,
      metadata: { fields: Object.keys(changes) },
    });
    return org;
  }

  isSetupComplete(org: OrganizationProfile) {
    return REQUIRED_FOR_SETUP.every((f) => !!org[f]);
  }

  async completeSetup(orgId: string, userId: string) {
    const org = await this.get(orgId);
    const missing = REQUIRED_FOR_SETUP.filter((f) => !org[f]);
    if (missing.length > 0) {
      throw new BadRequestException({ message: 'Kuruluş bilgileri eksik', missing });
    }
    const [updated] = await this.db
      .update(organizations)
      .set({ setupCompletedAt: org.setupCompletedAt ?? new Date() })
      .where(eq(organizations.id, orgId))
      .returning(ORG_COLUMNS);
    await this.audit.record({ action: 'organization.setup_completed', organizationId: orgId, userId });
    return updated;
  }

  async logo(orgId: string) {
    const [row] = await this.db
      .select({ content: organizations.logo, mimeType: organizations.logoMime })
      .from(organizations)
      .where(eq(organizations.id, orgId));
    if (!row?.content || !row.mimeType) throw new NotFoundException('Logo yok');
    return { content: row.content, mimeType: row.mimeType };
  }

  async setLogo(orgId: string, userId: string, file: { buffer: Buffer; mimetype: string }) {
    if (!LOGO_TYPES[file.mimetype]?.(file.buffer)) throw new BadRequestException('Logo PNG veya JPEG görsel olmalı');
    const [org] = await this.db
      .update(organizations)
      .set({ logo: file.buffer, logoMime: file.mimetype, logoUpdatedAt: new Date() })
      .where(eq(organizations.id, orgId))
      .returning(ORG_COLUMNS);
    await this.audit.record({ action: 'organization.logo_set', organizationId: orgId, userId, entityType: 'organization', entityId: orgId });
    return org;
  }

  async removeLogo(orgId: string, userId: string) {
    const [org] = await this.db
      .update(organizations)
      .set({ logo: null, logoMime: null, logoUpdatedAt: null })
      .where(eq(organizations.id, orgId))
      .returning(ORG_COLUMNS);
    await this.audit.record({ action: 'organization.logo_removed', organizationId: orgId, userId, entityType: 'organization', entityId: orgId });
    return org;
  }
}
