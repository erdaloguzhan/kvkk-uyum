import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ORG_ADMIN_ROLE_KEY } from '@kvkk/shared';
import { and, count, eq, ne, sql } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';
import { PasswordResetService } from '../auth/password-reset.service';
import { generateToken, hashPassword } from '../common/crypto';
import { Database, InjectDb } from '../db/db.module';
import { memberships, organizations, roles, users } from '../db/schema';

@Injectable()
export class MembersService {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly audit: AuditService,
    private readonly passwordReset: PasswordResetService,
  ) {}

  list(orgId: string) {
    return this.db
      .select({
        id: memberships.id,
        status: memberships.status,
        createdAt: memberships.createdAt,
        user: { id: users.id, email: users.email, fullName: users.fullName },
        role: { id: roles.id, key: roles.key, name: roles.name },
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .innerJoin(roles, eq(roles.id, memberships.roleId))
      .where(eq(memberships.organizationId, orgId))
      .orderBy(users.fullName);
  }

  /**
   * Kullanıcıyı kuruluşa ekler. Sistemde kayıtlı değilse hesap oluşturulur ve
   * şifre belirleme daveti e-postayla gönderilir.
   */
  async add(orgId: string, actorId: string, input: { email: string; fullName: string; roleId: string }) {
    await this.findRole(orgId, input.roleId);
    const email = input.email.trim();

    let [user] = await this.db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(sql`lower(${users.email}) = lower(${email})`);
    const isNewUser = !user;
    if (!user) {
      [user] = await this.db
        .insert(users)
        .values({
          email,
          fullName: input.fullName.trim(),
          // Kullanılamaz rastgele şifre; kullanıcı davetle kendi şifresini belirler.
          passwordHash: await hashPassword(generateToken()),
        })
        .returning({ id: users.id, email: users.email });
    }

    const [existing] = await this.db
      .select({ id: memberships.id })
      .from(memberships)
      .where(and(eq(memberships.userId, user.id), eq(memberships.organizationId, orgId)));
    if (existing) throw new ConflictException('Kullanıcı zaten bu kuruluşun üyesi');

    const [membership] = await this.db
      .insert(memberships)
      .values({ userId: user.id, organizationId: orgId, roleId: input.roleId })
      .returning();

    if (isNewUser) {
      const [org] = await this.db
        .select({ name: organizations.name })
        .from(organizations)
        .where(eq(organizations.id, orgId));
      await this.passwordReset.sendInvite(user, org.name);
    }
    await this.audit.record({
      action: 'member.added',
      organizationId: orgId,
      userId: actorId,
      entityType: 'membership',
      entityId: membership.id,
      metadata: { email, roleId: input.roleId, newUser: isNewUser },
    });
    return membership;
  }

  async update(
    orgId: string,
    actorId: string,
    membershipId: string,
    changes: { roleId?: string; status?: 'active' | 'disabled' },
  ) {
    const current = await this.findMembership(orgId, membershipId);
    if (changes.roleId) await this.findRole(orgId, changes.roleId);

    const losesAdmin =
      current.roleKey === ORG_ADMIN_ROLE_KEY &&
      current.status === 'active' &&
      ((changes.roleId && changes.roleId !== current.roleId) || changes.status === 'disabled');
    if (losesAdmin) await this.assertAnotherActiveAdmin(orgId, membershipId);

    const [updated] = await this.db
      .update(memberships)
      .set(changes)
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

  async remove(orgId: string, actorId: string, membershipId: string) {
    const current = await this.findMembership(orgId, membershipId);
    if (current.roleKey === ORG_ADMIN_ROLE_KEY && current.status === 'active') {
      await this.assertAnotherActiveAdmin(orgId, membershipId);
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

  private async findRole(orgId: string, roleId: string) {
    const [role] = await this.db
      .select({ id: roles.id })
      .from(roles)
      .where(and(eq(roles.id, roleId), eq(roles.organizationId, orgId)));
    if (!role) throw new BadRequestException('Rol bu kuruluşa ait değil');
    return role;
  }

  private async findMembership(orgId: string, membershipId: string) {
    const [row] = await this.db
      .select({
        id: memberships.id,
        userId: memberships.userId,
        roleId: memberships.roleId,
        status: memberships.status,
        roleKey: roles.key,
      })
      .from(memberships)
      .innerJoin(roles, eq(roles.id, memberships.roleId))
      .where(and(eq(memberships.id, membershipId), eq(memberships.organizationId, orgId)));
    if (!row) throw new NotFoundException('Üyelik bulunamadı');
    return row;
  }

  /** Kuruluş yöneticisiz kalmamalı. */
  private async assertAnotherActiveAdmin(orgId: string, exceptMembershipId: string) {
    const [{ n }] = await this.db
      .select({ n: count() })
      .from(memberships)
      .innerJoin(roles, eq(roles.id, memberships.roleId))
      .where(
        and(
          eq(memberships.organizationId, orgId),
          eq(memberships.status, 'active'),
          eq(roles.key, ORG_ADMIN_ROLE_KEY),
          ne(memberships.id, exceptMembershipId),
        ),
      );
    if (n === 0) throw new BadRequestException('Kuruluşta en az bir aktif yönetici kalmalı');
  }
}
