import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  APPROVAL_STATUSES,
  ApprovalStatus,
  DEFAULT_APPROVAL_DUE_DAYS,
  DEFAULT_REMINDER_DAYS,
  NOTIFICATION_KINDS,
  PERMISSIONS,
  TASK_ENTITY_TYPES,
  TASK_RECURRENCE_MONTHS,
  TASK_RECURRENCES,
  TASK_STATUSES,
  TASK_TYPES,
  TaskEntityType,
  TaskStatus,
  TaskType,
} from '@kvkk/shared';
import { z } from 'zod';
import { AuthUser, CurrentOrg, CurrentUser, OrgContext, RequirePermissions } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { MAX_REMINDER_DAYS } from './alarms.service';
import { ApprovalsService } from './approvals.service';
import { NotificationsService } from './notifications.service';
import { TasksService, TaskViewer } from './tasks.service';

const keys = <T extends string>(o: Record<T, string>) => Object.keys(o) as [T, ...T[]];
const bool = z
  .enum(['true', 'false'])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === 'true'));
const note = z.string().trim().max(2000).nullish();

const creatableTypes = keys(TASK_TYPES).filter((t) => t !== 'approval') as [
  Exclude<TaskType, 'approval'>,
  ...Exclude<TaskType, 'approval'>[],
];
const taskFields = {
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(5000).nullish(),
  assigneeId: z.uuid(),
  dueDate: z.iso.date(),
  reminderDays: z.array(z.number().int().min(0).max(MAX_REMINDER_DAYS)).max(5),
  recurrenceMonths: z
    .number()
    .int()
    .refine((m) => (TASK_RECURRENCE_MONTHS as readonly number[]).includes(m), 'Geçersiz tekrarlama aralığı')
    .nullish(),
  entityType: z.enum(keys<TaskEntityType>(TASK_ENTITY_TYPES)).nullish(),
  entityId: z.uuid().nullish(),
};
const createTaskBody = z
  .object({
    ...taskFields,
    type: z.enum(creatableTypes).default('general'),
    reminderDays: taskFields.reminderDays.default(DEFAULT_REMINDER_DAYS),
  })
  .refine((b) => !b.entityType === !b.entityId, 'Bağlı kayıt türü ve kaydı birlikte verilmeli');
const updateTaskBody = z.object(taskFields).partial();
const taskQuery = z.object({
  status: z.enum(keys<TaskStatus>(TASK_STATUSES)).optional(),
  type: z.enum(keys<TaskType>(TASK_TYPES)).optional(),
  assigneeId: z.uuid().optional(),
  mine: bool,
  overdue: bool,
  entityType: z.enum(keys<TaskEntityType>(TASK_ENTITY_TYPES)).optional(),
  entityId: z.uuid().optional(),
});
const noteBody = z.object({ note }).default({});
const requestBody = z.object({ approverId: z.uuid(), dueDate: z.iso.date().nullish(), note });
const rejectBody = z.object({ note: z.string().trim().min(2, 'Ret gerekçesi yazılmalı').max(2000) });
const approvalQuery = z.object({
  status: z.enum(keys<ApprovalStatus>(APPROVAL_STATUSES)).optional(),
  documentId: z.uuid().optional(),
});
const notificationQuery = z.object({ unread: bool });

const taskViewer = (org: OrgContext, user: AuthUser): TaskViewer => ({
  userId: user.id,
  canReadAll: org.permissions.includes(PERMISSIONS.TASKS_READ),
  canManage: org.permissions.includes(PERMISSIONS.TASKS_MANAGE),
});

/**
 * Görevler. Listeleme, görüntüleme ve tamamlama her üyeye açıktır; `tasks.read` yetkisi
 * olmayan üye yalnızca kendisine atanan görevleri görür.
 */
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get('options')
  @RequirePermissions()
  options() {
    return {
      types: TASK_TYPES,
      statuses: TASK_STATUSES,
      entityTypes: TASK_ENTITY_TYPES,
      recurrences: TASK_RECURRENCES,
      defaultReminderDays: DEFAULT_REMINDER_DAYS,
      maxReminderDays: MAX_REMINDER_DAYS,
    };
  }

  @Get('summary')
  @RequirePermissions(PERMISSIONS.TASKS_READ)
  summary(@CurrentOrg() org: OrgContext) {
    return this.tasks.summary(org.id);
  }

  @Get()
  @RequirePermissions()
  async list(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Query(new ZodPipe(taskQuery)) { mine, ...filter }: z.infer<typeof taskQuery>,
  ) {
    const viewer = taskViewer(org, user);
    return { items: await this.tasks.list(org.id, viewer, mine ? { ...filter, assigneeId: user.id } : filter) };
  }

  @Post()
  @RequirePermissions(PERMISSIONS.TASKS_MANAGE)
  create(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(createTaskBody)) body: z.infer<typeof createTaskBody>,
  ) {
    return this.tasks.create(org.id, user.id, body);
  }

  @Get(':id')
  @RequirePermissions()
  get(@CurrentOrg() org: OrgContext, @CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.tasks.get(org.id, taskViewer(org, user), id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.TASKS_MANAGE)
  update(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(updateTaskBody)) body: z.infer<typeof updateTaskBody>,
  ) {
    return this.tasks.update(org.id, user.id, id, body);
  }

  /** Atanan kişi veya `tasks.manage` yetkisi olan tamamlar; tekrarlayan görevse sonraki dönem açılır. */
  @Post(':id/complete')
  @HttpCode(200)
  @RequirePermissions()
  complete(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(noteBody)) body: z.infer<typeof noteBody>,
  ) {
    return this.tasks.complete(org.id, taskViewer(org, user), id, body.note);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.TASKS_MANAGE)
  cancel(@CurrentOrg() org: OrgContext, @CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.tasks.cancel(org.id, user.id, id);
  }
}

/** Doküman sürümlerinin yayın onayı. */
@Controller()
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalsService) {}

  /** Taslak sürüm için onay ister (son tarih verilmezse bugünden itibaren DEFAULT_APPROVAL_DUE_DAYS gün). */
  @Post('documents/:id/versions/:versionId/approval-requests')
  @RequirePermissions(PERMISSIONS.DOCUMENTS_WRITE)
  request(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Body(new ZodPipe(requestBody)) body: z.infer<typeof requestBody>,
  ) {
    return this.approvals.request(org.id, user.id, id, versionId, body);
  }

  @Get('approval-requests/options')
  @RequirePermissions()
  options() {
    return { statuses: APPROVAL_STATUSES, defaultDueDays: DEFAULT_APPROVAL_DUE_DAYS };
  }

  /** Doküman yazma/onay yetkisi olanlar tümünü, diğerleri kendi talep ettiklerini ve onaylayacaklarını görür. */
  @Get('approval-requests')
  @RequirePermissions()
  async list(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Query(new ZodPipe(approvalQuery)) query: z.infer<typeof approvalQuery>,
  ) {
    return { items: await this.approvals.list(org.id, approvalViewer(org, user), query) };
  }

  @Get('approval-requests/:id')
  @RequirePermissions()
  get(@CurrentOrg() org: OrgContext, @CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.approvals.get(org.id, approvalViewer(org, user), id);
  }

  @Post('approval-requests/:id/approve')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.DOCUMENTS_APPROVE)
  approve(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(noteBody)) body: z.infer<typeof noteBody>,
  ) {
    return this.approvals.approve(org.id, user.id, id, body.note);
  }

  @Post('approval-requests/:id/reject')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.DOCUMENTS_APPROVE)
  reject(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(rejectBody)) body: z.infer<typeof rejectBody>,
  ) {
    return this.approvals.reject(org.id, user.id, id, body.note);
  }

  @Post('approval-requests/:id/cancel')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.DOCUMENTS_WRITE)
  cancel(@CurrentOrg() org: OrgContext, @CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.approvals.cancel(org.id, user.id, id);
  }
}

const approvalViewer = (org: OrgContext, user: AuthUser) => ({
  userId: user.id,
  canReadAll:
    org.permissions.includes(PERMISSIONS.DOCUMENTS_WRITE) || org.permissions.includes(PERMISSIONS.DOCUMENTS_APPROVE),
});

/** Kullanıcının bu kuruluştaki bildirimleri (alarmlar). */
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('options')
  @RequirePermissions()
  options() {
    return { kinds: NOTIFICATION_KINDS };
  }

  @Get()
  @RequirePermissions()
  list(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Query(new ZodPipe(notificationQuery)) query: z.infer<typeof notificationQuery>,
  ) {
    return this.notifications.list(org.id, user.id, query.unread === true);
  }

  @Post('read-all')
  @HttpCode(204)
  @RequirePermissions()
  async readAll(@CurrentOrg() org: OrgContext, @CurrentUser() user: AuthUser) {
    await this.notifications.markAllRead(org.id, user.id);
  }

  @Post(':id/read')
  @HttpCode(204)
  @RequirePermissions()
  async read(@CurrentOrg() org: OrgContext, @CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.notifications.markRead(org.id, user.id, id);
  }
}
