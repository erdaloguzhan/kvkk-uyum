import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, count, desc, eq, sql } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';
import { PasswordResetService } from '../auth/password-reset.service';
import { Database, InjectDb } from '../db/db.module';
import { memberships, organizations, users } from '../db/schema';
import { MembersService } from '../members/members.service';
import { OrganizationProfile, OrganizationsService } from '../organizations/organizations.service';

interface Person {
  email: string;
  fullName: string;
  /** Cep telefonu; giriş doğrulama kodu buna SMS ile gider. */
  phone?: string | null;
}

export interface NewOrganization extends OrganizationProfile {
  /** Kuruluş e-postası; KVKK Sorumlusunun kullanıcı adı olur ve davet buraya gönderilir. */
  email: string;
  /** KVKK Sorumlusunun adı soyadı. */
  authorizedPerson: string;
  /** KVKK Sorumlusunun cep telefonu. */
  authorizedPhone?: string | null;
  /** Onay veren Yönetici. E-postası Sorumlununkiyle aynıysa tek kullanıcı "Sorumlu + Yönetici" olur. */
  approver: Person;
}

const sameEmail = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Platform yöneticisinin kuruluş işlemleri (yönetim paneli). */
@Injectable()
export class AdminOrganizationsService {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly orgs: OrganizationsService,
    private readonly passwordReset: PasswordResetService,
    private readonly members: MembersService,
    private readonly audit: AuditService,
  ) {}

  async list() {
    const rows = await this.db
      .select({
        id: organizations.id,
        name: organizations.name,
        email: organizations.email,
        authorizedPerson: organizations.authorizedPerson,
        licenseStatus: organizations.licenseStatus,
        licenseExpiresAt: organizations.licenseExpiresAt,
        setupCompletedAt: organizations.setupCompletedAt,
        createdAt: organizations.createdAt,
        memberCount: count(memberships.id),
      })
      .from(organizations)
      .leftJoin(memberships, eq(memberships.organizationId, organizations.id))
      .groupBy(organizations.id)
      .orderBy(desc(organizations.createdAt));
    return rows;
  }

  /**
   * Kuruluşu hazır kullanıcılarıyla oluşturur: kuruluş e-postası KVKK Sorumlusu, ayrıca Yönetici (aynı
   * e-postaysa tek hesap). Hesabı olmayanlara şifre oluşturma bağlantısı, olanlara bilgilendirme gider.
   */
  async create(adminId: string, input: NewOrganization) {
    const { approver, authorizedPhone, ...profile } = input;
    const email = input.email.trim();
    const combined = sameEmail(approver.email, email);

    const created = await this.orgs.create(null, { ...profile, email }, adminId);
    const people = [
      { email, fullName: input.authorizedPerson, phone: authorizedPhone, roleKey: combined ? 'officer_approver' : 'kvkk_officer' },
      ...(combined ? [] : [{ ...approver, roleKey: 'approver' }]),
    ];
    const members = [];
    for (const person of people) {
      const added = await this.members.add(created.id, adminId, person);
      members.push({ ...added.user, role: person.roleKey });
    }
    const org = this.orgs.isSetupComplete(created)
      ? await this.orgs.completeSetup(created.id, adminId)
      : created;

    await this.audit.record({
      action: 'admin.organization_created',
      organizationId: org.id,
      userId: adminId,
      entityType: 'organization',
      entityId: org.id,
      metadata: { members: members.map((m) => ({ email: m.email, role: m.role, newUser: m.newUser })) },
    });
    return { organization: org, members };
  }

  /** Kuruluş e-postasındaki yetkiliye şifre oluşturma bağlantısını yeniden gönderir (eskisi geçersiz olur). */
  async resendInvite(adminId: string, orgId: string) {
    const [org] = await this.db.select().from(organizations).where(eq(organizations.id, orgId));
    if (!org) throw new NotFoundException('Kuruluş bulunamadı');
    if (!org.email) throw new BadRequestException('Kuruluşun e-posta adresi yok');
    const [owner] = await this.db
      .select({ id: users.id, email: users.email, fullName: users.fullName })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(
        and(eq(memberships.organizationId, orgId), sql`lower(${users.email}) = lower(${org.email})`),
      );
    if (!owner) {
      throw new BadRequestException('Kuruluş e-postasıyla kayıtlı bir kullanıcı yok');
    }
    await this.passwordReset.revokePending(owner.id);
    await this.passwordReset.sendInvite(owner, org.name);
    await this.audit.record({
      action: 'admin.invite_resent',
      organizationId: orgId,
      userId: adminId,
      entityType: 'user',
      entityId: owner.id,
    });
    return { email: owner.email };
  }
}
