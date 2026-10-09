import { BadRequestException } from '@nestjs/common';
import type { Permission } from '@kvkk/shared';
import { and, eq } from 'drizzle-orm';
import { Database } from '../db/db.module';
import { memberships, roles, users } from '../db/schema';

/** Kuruluşun aktif üyesini yetkileriyle getirir; değilse null. */
export async function findActiveMember(db: Database, orgId: string, userId: string) {
  const [row] = await db
    .select({ id: users.id, fullName: users.fullName, email: users.email, permissions: roles.permissions })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .innerJoin(roles, eq(roles.id, memberships.roleId))
    .where(
      and(
        eq(memberships.organizationId, orgId),
        eq(memberships.userId, userId),
        eq(memberships.status, 'active'),
        eq(users.isActive, true),
      ),
    );
  return row ? { ...row, permissions: row.permissions as Permission[] } : null;
}

export async function requireActiveMember(db: Database, orgId: string, userId: string, permission?: Permission) {
  const member = await findActiveMember(db, orgId, userId);
  if (!member) throw new BadRequestException('Seçilen kişi kuruluşun aktif bir üyesi değil');
  if (permission && !member.permissions.includes(permission)) {
    throw new BadRequestException('Seçilen kişinin bu işlem için yetkisi yok');
  }
  return member;
}
