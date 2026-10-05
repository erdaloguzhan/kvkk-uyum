import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ORG_ADMIN_ROLE_KEY, SYSTEM_ROLES } from '@kvkk/shared';
import { eq } from 'drizzle-orm';
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
}

/** Kurulum sihirbazının tamamlanması için dolu olması gereken alanlar. */
const REQUIRED_FOR_SETUP: (keyof OrganizationProfile)[] = [
  'name',
  'address',
  'email',
  'phone',
  'kepAddress',
  'authorizedPerson',
];

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectDb() private readonly db: Database,
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly audit: AuditService,
  ) {}

  /** Kuruluşu oluşturur, varsayılan rolleri ekler ve oluşturanı Kuruluş Yöneticisi yapar. */
  async create(userId: string, profile: OrganizationProfile) {
    const org = await this.db.transaction(async (tx) => {
      const [org] = await tx
        .insert(organizations)
        .values({
          ...profile,
          licenseStatus: 'trial',
          licenseExpiresAt: new Date(Date.now() + this.config.trialDays * 24 * 60 * 60 * 1000),
        })
        .returning();
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
      const adminRole = createdRoles.find((r) => r.key === ORG_ADMIN_ROLE_KEY)!;
      await tx.insert(memberships).values({ userId, organizationId: org.id, roleId: adminRole.id });
      return org;
    });
    await this.audit.record({
      action: 'organization.created',
      organizationId: org.id,
      userId,
      entityType: 'organization',
      entityId: org.id,
    });
    return org;
  }

  async get(orgId: string) {
    const [org] = await this.db.select().from(organizations).where(eq(organizations.id, orgId));
    return org;
  }

  async update(orgId: string, userId: string, changes: Partial<OrganizationProfile>) {
    const [org] = await this.db
      .update(organizations)
      .set(changes)
      .where(eq(organizations.id, orgId))
      .returning();
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
      .returning();
    await this.audit.record({ action: 'organization.setup_completed', organizationId: orgId, userId });
    return updated;
  }
}
