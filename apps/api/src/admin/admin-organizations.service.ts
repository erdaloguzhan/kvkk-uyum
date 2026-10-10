import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ORG_ADMIN_ROLE_KEY } from '@kvkk/shared';
import { and, count, desc, eq, sql } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';
import { MailerService } from '../auth/mailer.service';
import { PasswordResetService } from '../auth/password-reset.service';
import { generateToken, hashPassword } from '../common/crypto';
import { AppConfig, CONFIG } from '../config';
import { Database, InjectDb } from '../db/db.module';
import { memberships, organizations, roles, users } from '../db/schema';
import { OrganizationProfile, OrganizationsService } from '../organizations/organizations.service';

export interface NewOrganization extends OrganizationProfile {
  /** Kuruluş e-postası; kuruluş yetkilisinin kullanıcı adı olur ve davet buraya gönderilir. */
  email: string;
  /** Kuruluş yetkilisinin adı soyadı. */
  authorizedPerson: string;
}

/** Platform yöneticisinin kuruluş işlemleri (yönetim paneli). */
@Injectable()
export class AdminOrganizationsService {
  constructor(
    @InjectDb() private readonly db: Database,
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly orgs: OrganizationsService,
    private readonly passwordReset: PasswordResetService,
    private readonly mailer: MailerService,
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
   * Kuruluşu oluşturur ve kayıttaki e-posta adresini kuruluş yöneticisi yapar. Bu adresle hesap yoksa
   * açılır ve şifre oluşturma bağlantısı gönderilir; hesap varsa kuruluşa eklendiği bildirilir.
   */
  async create(adminId: string, input: NewOrganization) {
    const email = input.email.trim();
    let [owner] = await this.db
      .select({ id: users.id, email: users.email, fullName: users.fullName })
      .from(users)
      .where(sql`lower(${users.email}) = lower(${email})`);
    const newUser = !owner;
    if (!owner) {
      [owner] = await this.db
        .insert(users)
        .values({
          email,
          fullName: input.authorizedPerson.trim(),
          // Kullanılamaz rastgele şifre; yetkili bağlantıyla kendi şifresini oluşturur.
          passwordHash: await hashPassword(generateToken()),
        })
        .returning({ id: users.id, email: users.email, fullName: users.fullName });
    }

    const created = await this.orgs.create(owner.id, { ...input, email }, adminId);
    const org = this.orgs.isSetupComplete(created)
      ? await this.orgs.completeSetup(created.id, adminId)
      : created;

    if (newUser) {
      await this.passwordReset.sendInvite(owner, org.name);
    } else {
      await this.sendAddedNotice(owner, org.name);
    }
    await this.audit.record({
      action: 'admin.organization_created',
      organizationId: org.id,
      userId: adminId,
      entityType: 'organization',
      entityId: org.id,
      metadata: { ownerEmail: email, newUser },
    });
    return { organization: org, owner: { id: owner.id, email: owner.email, newUser } };
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
      .innerJoin(roles, eq(roles.id, memberships.roleId))
      .where(
        and(
          eq(memberships.organizationId, orgId),
          eq(roles.key, ORG_ADMIN_ROLE_KEY),
          sql`lower(${users.email}) = lower(${org.email})`,
        ),
      );
    if (!owner) {
      throw new BadRequestException('Kuruluş e-postasıyla kayıtlı bir kuruluş yöneticisi yok');
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

  private sendAddedNotice(user: { email: string; fullName: string }, orgName: string) {
    return this.mailer.send({
      to: user.email,
      subject: `${orgName} - KVK Yönetim Sistemi`,
      text:
        `Merhaba ${user.fullName},\n\n` +
        `${orgName} kuruluşu KVK Yönetim Sistemine eklendi ve hesabınıza kuruluş yöneticisi olarak bağlandı.\n\n` +
        `Mevcut şifrenizle giriş yapabilirsiniz: ${this.config.appUrl}/giris\n` +
        `Kullanıcı adınız bu e-posta adresidir: ${user.email}\n`,
    });
  }
}
