import { Inject, Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { and, eq, lte } from 'drizzle-orm';
import { AppConfig, CONFIG } from '../config';
import { Database, InjectDb } from '../db/db.module';
import { memberships, tasks } from '../db/schema';
import { addDays, dateIn, daysBetween, formatDate } from './dates';
import { findActiveMember } from './members';
import { NewNotification, NotificationsService } from './notifications.service';

/** Hatırlatma günlerinin üst sınırı (görev girişinde de bu sınır uygulanır). */
export const MAX_REMINDER_DAYS = 90;

type TaskRow = typeof tasks.$inferSelect;

/**
 * Açık görevler için hatırlatma ve gecikme alarmları üretir.
 * - Son tarihe hatırlatma günü kadar kala: hatırlatma (görev o günden sonra açıldıysa atlanır)
 * - Son gün: "son gün bugün"
 * - Süre geçince: atanan kişiye ilk gün ve sonra haftada bir; görevi açan kişiye bir kez.
 * Her alarmın tekil bir anahtarı vardır; tekrar çalıştırmak aynı alarmı ikinci kez üretmez.
 */
@Injectable()
export class AlarmsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(AlarmsService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    @InjectDb() private readonly db: Database,
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly notifications: NotificationsService,
  ) {}

  onApplicationBootstrap() {
    const minutes = this.config.alarmIntervalMinutes;
    if (process.env.NODE_ENV === 'test' || minutes <= 0) return;
    const tick = () =>
      this.run().catch((err) => this.logger.error('Alarm taraması başarısız', err as Error));
    this.timer = setInterval(tick, minutes * 60_000);
    this.timer.unref();
    void tick();
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Tüm kuruluşların açık görevlerini tarar; oluşturulan bildirim sayısını döner. */
  async run(now = new Date()): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const today = dateIn(now);
      const rows = await this.db
        .select({ task: tasks })
        .from(tasks)
        .innerJoin(
          memberships,
          and(
            eq(memberships.userId, tasks.assigneeId),
            eq(memberships.organizationId, tasks.organizationId),
            eq(memberships.status, 'active'),
          ),
        )
        .where(and(eq(tasks.status, 'open'), lte(tasks.dueDate, addDays(today, MAX_REMINDER_DAYS))));
      let created = 0;
      for (const { task } of rows) {
        for (const n of this.alarmsFor(task, today)) {
          // Görevi açan kişi artık kuruluşta değilse ona bildirim gönderilmez.
          if (n.userId !== task.assigneeId && !(await findActiveMember(this.db, task.organizationId, n.userId))) continue;
          if (await this.notifications.notify(n)) created++;
        }
      }
      return created;
    } finally {
      this.running = false;
    }
  }

  private alarmsFor(task: TaskRow, today: string): NewNotification[] {
    const daysLeft = daysBetween(today, task.dueDate);
    const due = formatDate(task.dueDate);
    const base = { organizationId: task.organizationId, taskId: task.id };
    const key = `task:${task.id}:${task.dueDate}`;

    if (daysLeft > 0) {
      // Görev açıldığında zaten geçilmiş hatırlatma eşikleri atlanır (atama bildirimi yeterli).
      const leadDays = daysBetween(dateIn(task.createdAt), task.dueDate);
      const threshold = [...task.reminderDays]
        .filter((d) => d >= daysLeft && d < leadDays)
        .sort((a, b) => a - b)[0];
      if (threshold === undefined) return [];
      return [
        {
          ...base,
          userId: task.assigneeId,
          kind: 'task_reminder',
          title: `Hatırlatma: ${task.title} (${daysLeft} gün kaldı)`,
          body: `Görevin son tarihine ${daysLeft} gün kaldı: ${task.title}\nSon tarih: ${due}\n`,
          dedupeKey: `${key}:reminder:${threshold}`,
        },
      ];
    }
    if (daysLeft === 0) {
      return [
        {
          ...base,
          userId: task.assigneeId,
          kind: 'task_due_today',
          title: `Son gün bugün: ${task.title}`,
          body: `Görevin son günü bugün: ${task.title}\nSon tarih: ${due}\n`,
          dedupeKey: `${key}:due`,
        },
      ];
    }
    const late = -daysLeft;
    const alarms: NewNotification[] = [
      {
        ...base,
        userId: task.assigneeId,
        kind: 'task_overdue',
        title: `Süresi geçti: ${task.title}`,
        body: `Görevin süresi ${late} gün önce doldu: ${task.title}\nSon tarih: ${due}\n`,
        // İlk gecikme gününde ve sonra haftada bir.
        dedupeKey: `${key}:overdue:${Math.floor((late - 1) / 7)}`,
      },
    ];
    if (task.createdBy && task.createdBy !== task.assigneeId) {
      alarms.push({
        ...base,
        userId: task.createdBy,
        kind: 'task_overdue',
        title: `Süresi geçti: ${task.title}`,
        body: `Açtığınız görevin süresi doldu ve henüz tamamlanmadı: ${task.title}\nSon tarih: ${due}\n`,
        dedupeKey: `${key}:overdue-creator`,
      });
    }
    return alarms;
  }
}
