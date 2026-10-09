import { Injectable, NotFoundException } from '@nestjs/common';
import { NotificationKind } from '@kvkk/shared';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { MailerService } from '../auth/mailer.service';
import { Database, InjectDb } from '../db/db.module';
import { notifications, users } from '../db/schema';

export interface NewNotification {
  organizationId: string;
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  taskId?: string | null;
  approvalRequestId?: string | null;
  /** Verilirse aynı anahtarla ikinci bildirim oluşturulmaz. */
  dedupeKey?: string;
}

@Injectable()
export class NotificationsService {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly mailer: MailerService,
  ) {}

  /**
   * Bildirimi kaydeder ve kullanıcıya e-postayla da gönderir.
   * Aynı `dedupeKey` ile daha önce oluşturulduysa hiçbir şey yapmaz ve `false` döner.
   */
  async notify(n: NewNotification): Promise<boolean> {
    const inserted = await this.db
      .insert(notifications)
      .values(n)
      .onConflictDoNothing({ target: notifications.dedupeKey })
      .returning({ id: notifications.id });
    if (inserted.length === 0) return false;
    const [user] = await this.db.select({ email: users.email }).from(users).where(eq(users.id, n.userId));
    if (user) await this.mailer.send({ to: user.email, subject: n.title, text: n.body });
    return true;
  }

  async list(orgId: string, userId: string, unreadOnly: boolean) {
    const mine = and(eq(notifications.organizationId, orgId), eq(notifications.userId, userId));
    const items = await this.db
      .select()
      .from(notifications)
      .where(unreadOnly ? and(mine, isNull(notifications.readAt)) : mine)
      .orderBy(desc(notifications.createdAt))
      .limit(100);
    const [{ unread }] = await this.db
      .select({ unread: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(mine, isNull(notifications.readAt)));
    return { items, unreadCount: unread };
  }

  async markRead(orgId: string, userId: string, id: string) {
    const updated = await this.db
      .update(notifications)
      .set({ readAt: sql`coalesce(${notifications.readAt}, now())` })
      .where(
        and(eq(notifications.id, id), eq(notifications.organizationId, orgId), eq(notifications.userId, userId)),
      )
      .returning({ id: notifications.id });
    if (updated.length === 0) throw new NotFoundException('Bildirim bulunamadı');
  }

  async markAllRead(orgId: string, userId: string) {
    await this.db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(eq(notifications.organizationId, orgId), eq(notifications.userId, userId), isNull(notifications.readAt)),
      );
  }
}
