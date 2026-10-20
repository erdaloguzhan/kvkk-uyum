import { Injectable, Logger } from '@nestjs/common';
import { Database, InjectDb } from '../db/db.module';
import { auditLogs } from '../db/schema';
import { auditContext } from './audit-context';

export interface AuditEntry {
  action: string;
  organizationId?: string | null;
  userId?: string | null;
  entityType?: string;
  entityId?: string;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(@InjectDb() private readonly db: Database) {}

  /** Log kaydı yazar. HTTP isteği içinde çağrılırsa IP ve tarayıcı bilgisi verilmediğinde istekten alınır. */
  async record(entry: AuditEntry): Promise<void> {
    const ctx = auditContext.getStore();
    if (ctx) {
      ctx.recorded = true;
      entry = { ...entry, ip: entry.ip ?? ctx.ip, userAgent: entry.userAgent ?? ctx.userAgent };
    }
    try {
      await this.db.insert(auditLogs).values(entry);
    } catch (err) {
      // Log yazılamaması kullanıcı işlemini bozmamalı, ama görünür olmalı.
      this.logger.error(`Audit log yazılamadı: ${entry.action}`, err as Error);
    }
  }
}
