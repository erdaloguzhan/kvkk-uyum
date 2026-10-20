import { Controller, Get, Query } from '@nestjs/common';
import { AUDIT_MODULES, PERMISSIONS } from '@kvkk/shared';
import { and, desc, eq, gte, like, lt, or } from 'drizzle-orm';
import { z } from 'zod';
import { CurrentOrg, OrgContext, RequirePermissions } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { Database, InjectDb } from '../db/db.module';
import { auditLogs, users } from '../db/schema';

const DAY = 24 * 60 * 60 * 1000;

const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  before: z.iso.datetime({ offset: true }).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  action: z.string().max(100).optional(),
  module: z.enum(Object.keys(AUDIT_MODULES) as [string, ...string[]]).optional(),
  userId: z.uuid().optional(),
  entityId: z.string().max(100).optional(),
});

@Controller('audit-logs')
export class AuditController {
  constructor(@InjectDb() private readonly db: Database) {}

  @Get()
  @RequirePermissions(PERMISSIONS.AUDIT_READ)
  async list(@CurrentOrg() org: OrgContext, @Query(new ZodPipe(listQuery)) q: z.infer<typeof listQuery>) {
    const conditions = [eq(auditLogs.organizationId, org.id)];
    if (q.before) conditions.push(lt(auditLogs.createdAt, new Date(q.before)));
    // `action` tam ad (inventory.updated) veya modül önekidir (inventory).
    if (q.action) conditions.push(or(eq(auditLogs.action, q.action), like(auditLogs.action, `${q.action.replace(/[%_\\]/g, '\\$&')}.%`))!);
    if (q.module) {
      conditions.push(or(...AUDIT_MODULES[q.module].prefixes.map((p) => like(auditLogs.action, `${p}.%`)))!);
    }
    if (q.userId) conditions.push(eq(auditLogs.userId, q.userId));
    if (q.entityId) conditions.push(eq(auditLogs.entityId, q.entityId));
    // Tarihler Türkiye saatine göre gün olarak verilir; `to` günü dahildir.
    if (q.from) conditions.push(gte(auditLogs.createdAt, new Date(`${q.from}T00:00:00+03:00`)));
    if (q.to) conditions.push(lt(auditLogs.createdAt, new Date(new Date(`${q.to}T00:00:00+03:00`).getTime() + DAY)));

    const items = await this.db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        ip: auditLogs.ip,
        userAgent: auditLogs.userAgent,
        metadata: auditLogs.metadata,
        createdAt: auditLogs.createdAt,
        user: { id: users.id, email: users.email, fullName: users.fullName },
      })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.userId))
      .where(and(...conditions))
      .orderBy(desc(auditLogs.createdAt))
      .limit(q.limit);
    return { items };
  }
}
