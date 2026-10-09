import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TASK_TYPES, TaskEntityType, TaskStatus, TaskType } from '@kvkk/shared';
import { and, asc, eq, getTableColumns, gte, lt, SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { AuditService } from '../audit/audit.service';
import { Database, InjectDb } from '../db/db.module';
import { documents, inventoryEntries, tasks, users } from '../db/schema';
import { addDays, addMonths, dateIn, daysBetween, formatDate, IsoDate } from './dates';
import { requireActiveMember } from './members';
import { NotificationsService } from './notifications.service';

type TaskRow = typeof tasks.$inferSelect;

export interface TaskInput {
  type: Exclude<TaskType, 'approval'>;
  title: string;
  description?: string | null;
  assigneeId: string;
  dueDate: IsoDate;
  reminderDays: number[];
  recurrenceMonths?: number | null;
  entityType?: TaskEntityType | null;
  entityId?: string | null;
}

export type TaskUpdate = Partial<Omit<TaskInput, 'type'>>;

export interface TaskFilter {
  status?: TaskStatus;
  type?: TaskType;
  assigneeId?: string;
  overdue?: boolean;
  entityType?: TaskEntityType;
  entityId?: string;
}

/** Görevleri listeleyen kişi: `tasks.read` yetkisi yoksa yalnızca kendisine atananları görür. */
export interface TaskViewer {
  userId: string;
  canReadAll: boolean;
  canManage: boolean;
}

const assignee = alias(users, 'assignee');

@Injectable()
export class TasksService {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(orgId: string, viewer: TaskViewer, filter: TaskFilter = {}, now = new Date()) {
    const today = dateIn(now);
    const conditions: SQL[] = [eq(tasks.organizationId, orgId)];
    if (!viewer.canReadAll) conditions.push(eq(tasks.assigneeId, viewer.userId));
    if (filter.assigneeId) conditions.push(eq(tasks.assigneeId, filter.assigneeId));
    if (filter.type) conditions.push(eq(tasks.type, filter.type));
    if (filter.entityType) conditions.push(eq(tasks.entityType, filter.entityType));
    if (filter.entityId) conditions.push(eq(tasks.entityId, filter.entityId));
    if (filter.overdue !== undefined) {
      conditions.push(eq(tasks.status, 'open'), filter.overdue ? lt(tasks.dueDate, today) : gte(tasks.dueDate, today));
    }
    if (filter.status) conditions.push(eq(tasks.status, filter.status));
    const rows = await this.select()
      .where(and(...conditions))
      .orderBy(asc(tasks.dueDate), asc(tasks.createdAt));
    return rows.map((r) => this.view(r, today));
  }

  /** Dashboard için sayılar. */
  async summary(orgId: string, now = new Date()) {
    const today = dateIn(now);
    const open = await this.db
      .select({ dueDate: tasks.dueDate, type: tasks.type })
      .from(tasks)
      .where(and(eq(tasks.organizationId, orgId), eq(tasks.status, 'open')));
    const weekEnd = addDays(today, 7);
    return {
      open: open.length,
      overdue: open.filter((t) => t.dueDate < today).length,
      dueToday: open.filter((t) => t.dueDate === today).length,
      dueWithin7Days: open.filter((t) => t.dueDate >= today && t.dueDate <= weekEnd).length,
      byType: Object.keys(TASK_TYPES).map((type) => ({ type, open: open.filter((t) => t.type === type).length })),
    };
  }

  async get(orgId: string, viewer: TaskViewer, id: string, now = new Date()) {
    const [row] = await this.select().where(and(eq(tasks.id, id), eq(tasks.organizationId, orgId)));
    if (!row || !(viewer.canReadAll || row.task.assigneeId === viewer.userId || row.task.createdBy === viewer.userId)) {
      throw new NotFoundException('Görev bulunamadı');
    }
    return this.view(row, dateIn(now));
  }

  async create(orgId: string, userId: string, input: TaskInput, now = new Date()) {
    if (input.dueDate < dateIn(now)) throw new BadRequestException('Son tarih geçmiş bir gün olamaz');
    await requireActiveMember(this.db, orgId, input.assigneeId);
    await this.checkEntity(orgId, input.entityType, input.entityId);
    const [task] = await this.db
      .insert(tasks)
      .values({
        ...input,
        reminderDays: normalizeReminders(input.reminderDays),
        organizationId: orgId,
        createdBy: userId,
      })
      .returning();
    await this.audit.record({
      action: 'task.created',
      organizationId: orgId,
      userId,
      entityType: 'task',
      entityId: task.id,
      metadata: { type: task.type, assigneeId: task.assigneeId, dueDate: task.dueDate },
    });
    if (task.assigneeId !== userId) await this.notifyAssigned(task);
    return this.get(orgId, { userId, canReadAll: true, canManage: true }, task.id, now);
  }

  async update(orgId: string, userId: string, id: string, input: TaskUpdate, now = new Date()) {
    const before = await this.findOpen(orgId, id);
    if (before.type === 'approval') {
      throw new ConflictException('Onay görevleri onay talebi üzerinden yönetilir');
    }
    const changed = (Object.keys(input) as (keyof TaskUpdate)[]).filter(
      (k) => input[k] !== undefined && JSON.stringify(before[k]) !== JSON.stringify(input[k]),
    );
    if (changed.length === 0) return this.get(orgId, { userId, canReadAll: true, canManage: true }, id, now);
    if (input.dueDate && changed.includes('dueDate') && input.dueDate < dateIn(now)) {
      throw new BadRequestException('Son tarih geçmiş bir gün olamaz');
    }
    if (input.assigneeId && changed.includes('assigneeId')) await requireActiveMember(this.db, orgId, input.assigneeId);
    if (changed.includes('entityType') || changed.includes('entityId')) {
      const entityType = input.entityType !== undefined ? input.entityType : before.entityType;
      const entityId = input.entityId !== undefined ? input.entityId : before.entityId;
      if (!entityType !== !entityId) throw new BadRequestException('Bağlı kayıt türü ve kaydı birlikte verilmeli');
      await this.checkEntity(orgId, entityType, entityId);
    }
    const [task] = await this.db
      .update(tasks)
      .set({
        ...input,
        ...(input.reminderDays ? { reminderDays: normalizeReminders(input.reminderDays) } : {}),
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, id))
      .returning();
    await this.audit.record({
      action: 'task.updated',
      organizationId: orgId,
      userId,
      entityType: 'task',
      entityId: id,
      metadata: { fields: changed },
    });
    if (changed.includes('assigneeId') && task.assigneeId !== userId) await this.notifyAssigned(task);
    return this.get(orgId, { userId, canReadAll: true, canManage: true }, id, now);
  }

  /**
   * Görevi tamamlar. Görevi atanan kişi veya `tasks.manage` yetkisi olan tamamlayabilir.
   * Tekrarlayan görevse bir sonraki dönemin görevi açılır ve `next` olarak döner.
   */
  async complete(orgId: string, viewer: TaskViewer, id: string, note: string | null | undefined, now = new Date()) {
    const task = await this.findOpen(orgId, id, viewer);
    if (task.type === 'approval') {
      throw new ConflictException('Onay görevi, onay talebi onaylanarak veya reddedilerek kapanır');
    }
    if (task.assigneeId !== viewer.userId && !viewer.canManage) {
      throw new ForbiddenException('Bu görevi yalnızca atanan kişi tamamlayabilir');
    }
    const today = dateIn(now);
    const next = await this.db.transaction(async (tx) => {
      const done = await tx
        .update(tasks)
        .set({ status: 'done', completedAt: now, completedBy: viewer.userId, completionNote: note ?? null, updatedAt: now })
        .where(and(eq(tasks.id, id), eq(tasks.status, 'open')))
        .returning({ id: tasks.id });
      if (done.length === 0) throw new ConflictException('Görev zaten kapatılmış');
      if (!task.recurrenceMonths) return null;
      // Sonraki dönem son tarihe göre hesaplanır; gecikmeli tamamlandıysa bugünden sonraki ilk döneme atlanır.
      let periods = 1;
      let dueDate = addMonths(task.dueDate, task.recurrenceMonths);
      while (dueDate <= today) dueDate = addMonths(task.dueDate, task.recurrenceMonths * ++periods);
      const [created] = await tx
        .insert(tasks)
        .values({
          organizationId: orgId,
          type: task.type,
          title: task.title,
          description: task.description,
          assigneeId: task.assigneeId,
          dueDate,
          reminderDays: task.reminderDays,
          recurrenceMonths: task.recurrenceMonths,
          entityType: task.entityType,
          entityId: task.entityId,
          previousTaskId: task.id,
          createdBy: viewer.userId,
        })
        .returning({ id: tasks.id });
      return created;
    });
    await this.audit.record({
      action: 'task.completed',
      organizationId: orgId,
      userId: viewer.userId,
      entityType: 'task',
      entityId: id,
      metadata: { nextTaskId: next?.id ?? null },
    });
    const full = { userId: viewer.userId, canReadAll: true, canManage: true };
    return {
      task: await this.get(orgId, full, id, now),
      next: next ? await this.get(orgId, full, next.id, now) : null,
    };
  }

  async cancel(orgId: string, userId: string, id: string, now = new Date()) {
    const task = await this.findOpen(orgId, id);
    if (task.type === 'approval') throw new ConflictException('Onay görevi, onay talebi iptal edilerek kapanır');
    await this.db.update(tasks).set({ status: 'cancelled', updatedAt: now }).where(eq(tasks.id, id));
    await this.audit.record({ action: 'task.cancelled', organizationId: orgId, userId, entityType: 'task', entityId: id });
    return this.get(orgId, { userId, canReadAll: true, canManage: true }, id, now);
  }

  private select() {
    return this.db
      .select({
        task: getTableColumns(tasks),
        assignee: { id: assignee.id, fullName: assignee.fullName, email: assignee.email },
      })
      .from(tasks)
      .innerJoin(assignee, eq(assignee.id, tasks.assigneeId));
  }

  private view(row: { task: TaskRow; assignee: { id: string; fullName: string; email: string } }, today: IsoDate) {
    const { task } = row;
    const daysLeft = daysBetween(today, task.dueDate);
    return {
      ...task,
      assignee: row.assignee,
      daysLeft: task.status === 'open' ? daysLeft : null,
      overdue: task.status === 'open' && daysLeft < 0,
    };
  }

  private async findOpen(orgId: string, id: string, viewer?: TaskViewer) {
    const [task] = await this.db.select().from(tasks).where(and(eq(tasks.id, id), eq(tasks.organizationId, orgId)));
    if (!task || (viewer && !viewer.canReadAll && task.assigneeId !== viewer.userId)) {
      throw new NotFoundException('Görev bulunamadı');
    }
    if (task.status !== 'open') throw new ConflictException('Görev zaten kapatılmış');
    return task;
  }

  private async checkEntity(orgId: string, entityType?: TaskEntityType | null, entityId?: string | null) {
    if (!entityType || !entityId) return;
    const table = entityType === 'document' ? documents : inventoryEntries;
    const [row] = await this.db
      .select({ id: table.id })
      .from(table)
      .where(and(eq(table.id, entityId), eq(table.organizationId, orgId)));
    if (!row) throw new BadRequestException('Bağlanan kayıt bulunamadı');
  }

  private async notifyAssigned(task: TaskRow) {
    await this.notifications.notify({
      organizationId: task.organizationId,
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

