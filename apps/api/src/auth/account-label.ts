import { and, eq } from 'drizzle-orm';
import { Database } from '../db/db.module';
import { memberships, roles, trainers, users } from '../db/schema';

/** Sistemin kullanıcıya görünen adı (Erdal, 27.10.2026). */
export const SYSTEM_NAME = 'KVK Uyum Yönetim Sistemi';

/** E-postaların ve giriş pencerelerinin hitabı. */
export const salutation = (fullName: string | null | undefined) => (fullName?.trim() ? `Sayın ${fullName.trim()},` : 'Sayın kullanıcımız,');

/** "A", "A ve B", "A, B ve C". */
function joinTr(items: string[]) {
  return items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} ve ${items[items.length - 1]}`;
}

/**
 * Kullanıcının rol(ler)i hitapta kullanılmak üzere: kuruluş rolleri (ör. "KVKK Sorumlusu"), aktif eğitimciyse
 * "Eğitmen", platform yöneticisiyse "Platform Yöneticisi". Hiç rolü yoksa null.
 */
export async function accountRoleLabel(db: Database, userId: string): Promise<string | null> {
  const [user] = await db
    .select({ isPlatformAdmin: users.isPlatformAdmin, trainerActive: trainers.isActive })
    .from(users)
    .leftJoin(trainers, eq(trainers.userId, users.id))
    .where(eq(users.id, userId));
  if (!user) return null;
  const orgRoles = await db
    .selectDistinct({ name: roles.name })
    .from(memberships)
    .innerJoin(roles, eq(roles.id, memberships.roleId))
    .where(and(eq(memberships.userId, userId), eq(memberships.status, 'active')));
  const names = orgRoles.map((r) => r.name).sort((a, b) => a.localeCompare(b, 'tr'));
  if (user.trainerActive) names.push('Eğitmen');
  if (user.isPlatformAdmin) names.push('Platform Yöneticisi');
  return names.length ? joinTr(names) : null;
}
