import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DocumentsModule } from '../documents/documents.module';
import { AlarmsService } from './alarms.service';
import { ApprovalsService } from './approvals.service';
import { NotificationsService } from './notifications.service';
import { TasksService } from './tasks.service';
import { TrainerTasksService } from './trainer-tasks.service';
import { ApprovalsController, NotificationsController, TasksController } from './workflow.controller';

@Module({
  imports: [AuthModule, DocumentsModule],
  controllers: [TasksController, ApprovalsController, NotificationsController],
  providers: [TasksService, TrainerTasksService, ApprovalsService, NotificationsService, AlarmsService],
  exports: [TasksService, TrainerTasksService, NotificationsService],
})
export class WorkflowModule {}
