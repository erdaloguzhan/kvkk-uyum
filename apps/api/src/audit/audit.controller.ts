import { Controller, Get, Query } from '@nestjs/common';
import { PERMISSIONS } from '@kvkk/shared';
import { and, desc, eq, lt } from 'drizzle-orm';
import { z } from 'zod';
import { CurrentOrg, OrgContext, RequirePermissions } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { Database, InjectDb } from '../db/db.module';
import { auditLogs, users } from '../db/schema';

const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  before: z.iso.datetime({ offset: true }).optional(),
  action: z.string().optional(),
});

@Controller('audit-logs')
export class AuditController {
  constructor(@InjectDb() private readonly db: Database) {}

  @Get()
  @RequirePermissions(PERMISSIONS.AUDIT_READ)
  async list(@CurrentOrg() org: OrgContext, @Query(new ZodPipe(listQuery)) q: z.infer<typeof listQuery>) {
    const conditions = [eq(auditLogs.organizationId, org.id)];
    if (q.before) conditions.push(lt(auditLogs.createdAt, new Date(q.before)));
    if (q.action) conditions.push(eq(auditLogs.action, q.action));

    const items = await this.db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        ip: auditLogs.ip,
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
