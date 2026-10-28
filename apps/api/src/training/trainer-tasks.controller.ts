import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { DEFAULT_REMINDER_DAYS, TASK_STATUSES, TaskStatus } from '@kvkk/shared';
import { z } from 'zod';
import { AuthUser, CurrentUser } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { MAX_REMINDER_DAYS } from '../workflow/alarms.service';
import { NotificationsService } from '../workflow/notifications.service';
import { TrainerTasksService } from '../workflow/trainer-tasks.service';
import { PlatformAdminOnly, TrainingStaffGuard } from './training-staff.guard';

const bool = z
  .enum(['true', 'false'])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === 'true'));
const note = z.string().trim().max(2000).nullish();
const fields = {
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(5000).nullish(),
  assigneeId: z.uuid(),
  dueDate: z.iso.date(),
  reminderDays: z.array(z.number().int().min(0).max(MAX_REMINDER_DAYS)).max(5),
};
const createBody = z.object({ ...fields, reminderDays: fields.reminderDays.default(DEFAULT_REMINDER_DAYS) });
const updateBody = z.object(fields).partial();
const listQuery = z.object({
  mine: bool,
  status: z.enum(Object.keys(TASK_STATUSES) as [TaskStatus, ...TaskStatus[]]).optional(),
});
const noteBody = z.object({ note }).default({});
const notificationQuery = z.object({ unread: bool });

/**
 * Eğitmen görevleri ve bildirimleri (yönetim paneli). Görevi platform yöneticisi atar; eğitmen kendi görevlerini
 * görür ve tamamlar. Bildirimler kuruluşa bağlı olmayan bildirimlerdir.
 */
@Controller('training-admin')
@UseGuards(TrainingStaffGuard)
export class TrainerTasksController {
  constructor(
    private readonly tasks: TrainerTasksService,
    private readonly notifications: NotificationsService,
  ) {}

  @Get('trainer-tasks')
  async list(@CurrentUser() user: AuthUser, @Query(new ZodPipe(listQuery)) query: z.infer<typeof listQuery>) {
    return { items: await this.tasks.list(await this.tasks.viewer(user.id), query) };
  }

  @Get('trainer-tasks/:id')
  async get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.tasks.get(await this.tasks.viewer(user.id), id);
  }

  @Post('trainer-tasks')
  @PlatformAdminOnly()
  create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(createBody)) body: z.infer<typeof createBody>) {
    return this.tasks.create(user.id, body);
  }

  @Patch('trainer-tasks/:id')
  @PlatformAdminOnly()
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(updateBody)) body: z.infer<typeof updateBody>) {
    return this.tasks.update(user.id, id, body);
  }

  @Post('trainer-tasks/:id/complete')
  @HttpCode(200)
  async complete(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(noteBody)) body: z.infer<typeof noteBody>) {
    return this.tasks.complete(await this.tasks.viewer(user.id), id, body.note);
  }

  @Post('trainer-tasks/:id/cancel')
  @HttpCode(200)
  @PlatformAdminOnly()
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(noteBody)) body: z.infer<typeof noteBody>) {
    return this.tasks.cancel(user.id, id, body.note);
  }

  @Get('notifications')
  notificationList(@CurrentUser() user: AuthUser, @Query(new ZodPipe(notificationQuery)) query: z.infer<typeof notificationQuery>) {
    return this.notifications.list(null, user.id, !!query.unread);
  }

  @Post('notifications/read-all')
  @HttpCode(204)
  readAll(@CurrentUser() user: AuthUser) {
    return this.notifications.markAllRead(null, user.id);
  }

  @Post('notifications/:id/read')
  @HttpCode(204)
  read(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.notifications.markRead(null, user.id, id);
  }
}
