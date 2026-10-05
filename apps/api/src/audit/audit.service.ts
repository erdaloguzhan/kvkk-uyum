import { Injectable, Logger } from '@nestjs/common';
import { Database, InjectDb } from '../db/db.module';
import { auditLogs } from '../db/schema';

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

  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.db.insert(auditLogs).values(entry);
    } catch (err) {
      // Log yazılamaması kullanıcı işlemini bozmamalı, ama görünür olmalı.
      this.logger.error(`Audit log yazılamadı: ${entry.action}`, err as Error);
    }
  }
}
