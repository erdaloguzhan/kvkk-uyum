import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Permission, PERMISSIONS } from '@kvkk/shared';
import { and, count, eq, ne, sql } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';
import { MailerService } from '../auth/mailer.service';
import { PasswordResetService } from '../auth/password-reset.service';
import { generateToken, hashPassword } from '../common/crypto';
import { AppConfig, CONFIG } from '../config';
import { Database, InjectDb } from '../db/db.module';
import { memberships, organizations, roles, users } from '../db/schema';

/**
 * Kuruluş kullanıcıları. Müşteri kuruluşlar kullanıcı ekleyemez veya rol değiştiremez;
 * bu işlemler yalnızca yönetim panelinden (platform yöneticisi) yapılır.
 */
@Injectable()
export class MembersService {
  constructor(
    @InjectDb() private readonly db: Database,
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly audit: AuditService,
    private readonly passwordReset: PasswordResetService,
    private readonly mailer: MailerService,
  ) {}

  list(orgId: string) {
    return this.db
      .select({
        id: memberships.id,
        status: memberships.status,
        createdAt: memberships.createdAt,
        user: { id: users.id, email: users.email, fullName: users.fullName, phone: users.phone },
        role: { id: roles.id, key: roles.key, name: roles.name },
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .innerJoin(roles, eq(roles.id, memberships.roleId))
      .where(eq(memberships.organizationId, orgId))
      .orderBy(users.fullName);
  }

  /**
   * Kullanıcıyı kuruluşa verilen rolle ekler. Sistemde kayıtlı değilse hesap açılır ve şifre oluşturma
   * bağlantısı gönderilir; kayıtlıysa kuruluşa eklendiği bildirilir.
   */
  async add(orgId: string, actorId: string | null, input: { email: string; fullName: string; roleKey: string; phone?: string | null }) {
    const role = await this.findRole(orgId, input.roleKey);
    const email = input.email.trim();
    const fullName = input.fullName.trim();

    let [user] = await this.db
      .select({ id: users.id, email: users.email, fullName: users.fullName })
      .from(users)
      .where(sql`lower(${users.email}) = lower(${email})`);
    const newUser = !user;
    if (!user) {
      [user] = await this.db
        .insert(users)
        .values({
          email,
          fullName,
          phone: input.phone ?? null,
          // Kullanılamaz rastgele şifre; kullanıcı bağlantıyla kendi şifresini oluşturur.
          passwordHash: await hashPassword(generateToken()),
        })
        .returning({ id: users.id, email: users.email, fullName: users.fullName });
    }

    const [existing] = await this.db
      .select({ id: memberships.id })
      .from(memberships)
      .where(and(eq(memberships.userId, user.id), eq(memberships.organizationId, orgId)));
    if (existing) throw new ConflictException('Kullanıcı zaten bu kuruluşun üyesi');
    if (!newUser && input.phone) await this.db.update(users).set({ phone: input.phone }).where(eq(users.id, user.id));

    const [membership] = await this.db
      .insert(memberships)
      .values({ userId: user.id, organizationId: orgId, roleId: role.id })
      .returning();

    const orgName = await this.orgName(orgId);
    if (newUser) {
      await this.passwordReset.sendInvite(user, orgName, {
        intro: `${orgName} için KVK Uyum Yönetim Sistemi hesabınız ${role.name} rolüyle oluşturuldu.`,
      });
    } else {
      await this.mailer.send({
        to: user.email,
        subject: `${orgName} - KVK Uyum Yönetim Sistemi`,
        text:
          `Sayın ${user.fullName},\n\n` +
          `Hesabınız KVK Uyum Yönetim Sisteminde ${orgName} kuruluşuna ${role.name} rolüyle bağlandı.\n\n` +
          `Mevcut şifrenizle giriş yapabilirsiniz: ${this.config.appUrl}/giris\n` +
          `Kullanıcı adınız bu e-posta adresidir: ${user.email}\n`,
      });
    }
    await this.audit.record({
      action: 'member.added',
      organizationId: orgId,
      userId: actorId,
      entityType: 'membership',
      entityId: membership.id,
      metadata: { email, role: role.key, newUser },
    });
    return { membership, user: { id: user.id, email: user.email, newUser } };
  }

  /**
   * Kullanıcının cep telefonu (giriş doğrulama kodu buna SMS ile gider). Platform yöneticisi veya kullanıcının
   * kendisi değiştirir; eski adrese bilgilendirme e-postası gider.
   */
  async setPhone(actorId: string, userId: string, phone: string | null) {
    const [user] = await this.db
      .update(users)
      .set({ phone })
      .where(eq(users.id, userId))
      .returning({ id: users.id, email: users.email, fullName: users.fullName, phone: users.phone });
    if (!user) throw new NotFoundException('Kullanıcı bulunamadı');
    await this.mailer.send({
      to: user.email,
      subject: 'KVK Uyum Yönetim Sistemi - cep telefonunuz değişti',
      text:
        `Sayın ${user.fullName},\n\n` +
        (phone
          ? `Hesabınızın cep telefonu ${phone} olarak kaydedildi. Giriş doğrulama kodları bu numaraya SMS ile gönderilecek.\n`
          : 'Hesabınızın cep telefonu silindi. Giriş doğrulama kodları e-posta adresinize gönderilecek.\n') +
        '\nBu değişikliği siz yapmadıysanız hemen platform yöneticisine bildirin.\n',
    });
    await this.audit.record({ action: 'user.phone_changed', userId: actorId, entityType: 'user', entityId: userId, metadata: { phone } });
    return user;
  }

  async update(
    orgId: string,
    actorId: string | null,
    membershipId: string,
    changes: { roleKey?: string; status?: 'active' | 'disabled' },
  ) {
    const current = await this.findMembership(orgId, membershipId);
    const newRole = changes.roleKey ? await this.findRole(orgId, changes.roleKey) : null;
    if (current.status === 'active') {
      const keeps = changes.status === 'disabled' ? [] : (newRole?.permissions ?? current.permissions);
      await this.assertOrgKeepsKeyPermissions(orgId, membershipId, current.permissions, keeps);
    }

    const [updated] = await this.db
      .update(memberships)
      .set({ ...(newRole && { roleId: newRole.id }), ...(changes.status && { status: changes.status }) })
      .where(eq(memberships.id, membershipId))
      .returning();
    await this.audit.record({
      action: 'member.updated',
      organizationId: orgId,
      userId: actorId,
      entityType: 'membership',
      entityId: membershipId,
      metadata: changes,
    });
    return updated;
  }

  async remove(orgId: string, actorId: string | null, membershipId: string) {
    const current = await this.findMembership(orgId, membershipId);
    if (current.status === 'active') {
      await this.assertOrgKeepsKeyPermissions(orgId, membershipId, current.permissions, []);
    }
    await this.db.delete(memberships).where(eq(memberships.id, membershipId));
    await this.audit.record({
      action: 'member.removed',
      organizationId: orgId,
      userId: actorId,
      entityType: 'membership',
      entityId: membershipId,
      metadata: { userId: current.userId },
    });
  }

  /** Şifre oluşturma bağlantısını yeniden gönderir; eski bağlantılar geçersiz olur. */
  async resendInvite(orgId: string, actorId: string, membershipId: string) {
    const current = await this.findMembership(orgId, membershipId);
    const [user] = await this.db
      .select({ id: users.id, email: users.email, fullName: users.fullName })
      .from(users)
      .where(eq(users.id, current.userId));
    await this.passwordReset.revokePending(user.id);
    await this.passwordReset.sendInvite(user, await this.orgName(orgId));
    await this.audit.record({
      action: 'admin.invite_resent',
      organizationId: orgId,
      userId: actorId,
      entityType: 'user',
      entityId: user.id,
    });
    return { email: user.email };
  }

  private async orgName(orgId: string) {
    const [org] = await this.db
      .select({ name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, orgId));
    if (!org) throw new NotFoundException('Kuruluş bulunamadı');
    return org.name;
  }

  private async findRole(orgId: string, roleKey: string) {
    const [role] = await this.db
      .select({ id: roles.id, key: roles.key, name: roles.name, permissions: roles.permissions })
      .from(roles)
      .where(and(eq(roles.key, roleKey), eq(roles.organizationId, orgId)));
    if (!role) throw new BadRequestException('Rol bu kuruluşta tanımlı değil');
    return { ...role, permissions: role.permissions as Permission[] };
  }

  private async findMembership(orgId: string, membershipId: string) {
    const [row] = await this.db
      .select({
        id: memberships.id,
        userId: memberships.userId,
        status: memberships.status,
        permissions: roles.permissions,
      })
      .from(memberships)
      .innerJoin(roles, eq(roles.id, memberships.roleId))
      .where(and(eq(memberships.id, membershipId), eq(memberships.organizationId, orgId)));
    if (!row) throw new NotFoundException('Üyelik bulunamadı');
    return { ...row, permissions: row.permissions as Permission[] };
  }

  /**
   * Kuruluşta işi yürüten (Sorumlu) ve doküman onaylayan (Yönetici) en az birer aktif kişi kalmalı;
   * aksi halde hiçbir doküman hazırlanamaz ya da yayınlanamaz.
   */
  private async assertOrgKeepsKeyPermissions(
    orgId: string,
    membershipId: string,
    had: Permission[],
    keeps: Permission[],
  ) {
    const checks: [Permission, string][] = [
      [PERMISSIONS.DOCUMENTS_WRITE, 'Kuruluşta en az bir aktif KVKK Sorumlusu kalmalı'],
      [PERMISSIONS.DOCUMENTS_APPROVE, 'Kuruluşta en az bir aktif Yönetici kalmalı'],
    ];
    for (const [permission, message] of checks) {
      if (!had.includes(permission) || keeps.includes(permission)) continue;
      const [{ n }] = await this.db
        .select({ n: count() })
        .from(memberships)
        .innerJoin(roles, eq(roles.id, memberships.roleId))
        .where(
          and(
            eq(memberships.organizationId, orgId),
            eq(memberships.status, 'active'),
            sql`${permission} = ANY(${roles.permissions})`,
            ne(memberships.id, membershipId),
          ),
        );
      if (n === 0) throw new BadRequestException(message);
    }
  }
}
