import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { TaskStatus } from '@kvkk/shared';
import { and, asc, eq, getTableColumns, isNull, SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { AuditService } from '../audit/audit.service';
import { Database, InjectDb } from '../db/db.module';
import { tasks, trainers, users } from '../db/schema';
import { dateIn, daysBetween, formatDate, IsoDate } from './dates';
import { NotificationsService } from './notifications.service';

export interface TrainerTaskInput {
  title: string;
  description?: string | null;
  /** Eğitmenin kullanıcı kimliği. */
  assigneeId: string;
  dueDate: IsoDate;
  reminderDays: number[];
}

/** Görevi görüntüleyen: platform yöneticisi tüm eğitmen görevlerini, eğitmen yalnızca kendisine atananları görür. */
export interface TrainerTaskViewer {
  userId: string;
  isAdmin: boolean;
}

const assignee = alias(users, 'assignee');
const creator = alias(users, 'creator');
/** Eğitmen görevleri kuruluşa bağlı değildir. */
const platformTask = isNull(tasks.organizationId);

/**
 * Platform yöneticisinin eğitmenlere atadığı görevler (Erdal, 28.10.2026: "Eğitmene Admin görev atayacak").
 * Kuruluş görevleriyle aynı tabloda, kuruluşu boş olarak tutulur; hatırlatma ve gecikme alarmları AlarmsService'te.
 */
@Injectable()
export class TrainerTasksService {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /** İstek yapan kişi platform yöneticisi mi (eğitim yönetimi uçlarına yalnızca yöneticiler ve aktif eğitmenler girer). */
  async viewer(userId: string): Promise<TrainerTaskViewer> {
    const [u] = await this.db.select({ isPlatformAdmin: users.isPlatformAdmin }).from(users).where(eq(users.id, userId));
    return { userId, isAdmin: !!u?.isPlatformAdmin };
  }

  async list(viewer: TrainerTaskViewer, filter: { mine?: boolean; status?: TaskStatus } = {}, now = new Date()) {
    const conditions: SQL[] = [platformTask];
    if (!viewer.isAdmin || filter.mine) conditions.push(eq(tasks.assigneeId, viewer.userId));
    if (filter.status) conditions.push(eq(tasks.status, filter.status));
    const rows = await this.select()
      .where(and(...conditions))
      .orderBy(asc(tasks.dueDate), asc(tasks.createdAt));
    return rows.map((r) => this.view(r, dateIn(now)));
  }

  async get(viewer: TrainerTaskViewer, id: string, now = new Date()) {
    const [row] = await this.select().where(and(eq(tasks.id, id), platformTask));
    if (!row || !(viewer.isAdmin || row.task.assigneeId === viewer.userId)) throw new NotFoundException('Görev bulunamadı');
    return this.view(row, dateIn(now));
  }

  async create(adminId: string, input: TrainerTaskInput, now = new Date()) {
    if (input.dueDate < dateIn(now)) throw new BadRequestException('Son tarih geçmiş bir gün olamaz');
    await this.requireActiveTrainer(input.assigneeId);
    const [task] = await this.db
      .insert(tasks)
      .values({ ...input, type: 'general', organizationId: null, reminderDays: normalizeReminders(input.reminderDays), createdBy: adminId })
      .returning();
    await this.audit.record({
      action: 'trainer_task.created',
      userId: adminId,
      entityType: 'task',
      entityId: task.id,
      metadata: { assigneeId: task.assigneeId, dueDate: task.dueDate },
    });
    if (task.assigneeId !== adminId) await this.notifyAssigned(task);
    return this.get({ userId: adminId, isAdmin: true }, task.id, now);
  }

  async update(adminId: string, id: string, input: Partial<TrainerTaskInput>, now = new Date()) {
    const before = await this.findOpen(id);
    const changed = (Object.keys(input) as (keyof TrainerTaskInput)[]).filter(
      (k) => input[k] !== undefined && JSON.stringify(before[k]) !== JSON.stringify(input[k]),
    );
    if (changed.length === 0) return this.get({ userId: adminId, isAdmin: true }, id, now);
    if (input.dueDate && changed.includes('dueDate') && input.dueDate < dateIn(now)) {
      throw new BadRequestException('Son tarih geçmiş bir gün olamaz');
    }
    if (input.assigneeId && changed.includes('assigneeId')) await this.requireActiveTrainer(input.assigneeId);
    const [task] = await this.db
      .update(tasks)
      .set({ ...input, ...(input.reminderDays ? { reminderDays: normalizeReminders(input.reminderDays) } : {}), updatedAt: new Date() })
      .where(eq(tasks.id, id))
      .returning();
    await this.audit.record({ action: 'trainer_task.updated', userId: adminId, entityType: 'task', entityId: id, metadata: { fields: changed } });
    if (changed.includes('assigneeId') && task.assigneeId !== adminId) await this.notifyAssigned(task);
    return this.get({ userId: adminId, isAdmin: true }, id, now);
  }

  /** Eğitmen kendi görevini, platform yöneticisi herhangi bir eğitmen görevini tamamlar. */
  async complete(viewer: TrainerTaskViewer, id: string, note: string | null | undefined, now = new Date()) {
    const task = await this.findOpen(id);
    if (task.assigneeId !== viewer.userId && !viewer.isAdmin) throw new NotFoundException('Görev bulunamadı');
    await this.db
      .update(tasks)
      .set({ status: 'done', completedAt: now, completedBy: viewer.userId, completionNote: note ?? null, updatedAt: now })
      .where(eq(tasks.id, id));
    await this.audit.record({ action: 'trainer_task.completed', userId: viewer.userId, entityType: 'task', entityId: id });
    return this.get(viewer, id, now);
  }

  async cancel(adminId: string, id: string, note: string | null | undefined, now = new Date()) {
    await this.findOpen(id);
    await this.db
      .update(tasks)
      .set({ status: 'cancelled', completedAt: now, completedBy: adminId, completionNote: note ?? null, updatedAt: now })
      .where(eq(tasks.id, id));
    await this.audit.record({ action: 'trainer_task.cancelled', userId: adminId, entityType: 'task', entityId: id });
    return this.get({ userId: adminId, isAdmin: true }, id, now);
  }

  private select() {
    return this.db
      .select({
        task: getTableColumns(tasks),
        assigneeName: assignee.fullName,
        creatorName: creator.fullName,
      })
      .from(tasks)
      .innerJoin(assignee, eq(assignee.id, tasks.assigneeId))
      .leftJoin(creator, eq(creator.id, tasks.createdBy));
  }

  private view(row: { task: typeof tasks.$inferSelect; assigneeName: string; creatorName: string | null }, today: string) {
    const { organizationId: _org, type: _type, entityType: _et, entityId: _eid, recurrenceMonths: _rec, previousTaskId: _prev, ...task } = row.task;
    const daysLeft = daysBetween(today, task.dueDate);
    return {
      ...task,
      assignee: { id: task.assigneeId, fullName: row.assigneeName },
      createdByName: row.creatorName,
      daysLeft,
      overdue: task.status === 'open' && daysLeft < 0,
    };
  }

  private async findOpen(id: string) {
    const [task] = await this.db.select().from(tasks).where(and(eq(tasks.id, id), platformTask));
    if (!task) throw new NotFoundException('Görev bulunamadı');
    if (task.status !== 'open') throw new ConflictException('Görev zaten kapatılmış');
    return task;
  }

  private async requireActiveTrainer(userId: string) {
    const [t] = await this.db
      .select({ id: trainers.id })
      .from(trainers)
      .innerJoin(users, eq(users.id, trainers.userId))
      .where(and(eq(trainers.userId, userId), eq(trainers.isActive, true), eq(users.isActive, true)));
    if (!t) throw new ForbiddenException('Görev yalnızca aktif bir eğitmene atanabilir');
  }

  private async notifyAssigned(task: typeof tasks.$inferSelect) {
    await this.notifications.notify({
      organizationId: null,
      userId: task.assigneeId,
      kind: 'task_assigned',
      title: `Yeni görev: ${task.title}`,
      body: `Size yeni bir görev atandı: ${task.title}\nSon tarih: ${formatDate(task.dueDate)}\n`,
      taskId: task.id,
    });
  }
}

function normalizeReminders(days: number[]) {
  return [...new Set(days)].sort((a, b) => b - a);
}
