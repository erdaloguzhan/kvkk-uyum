import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DocumentsModule } from '../documents/documents.module';
import { AlarmsService } from './alarms.service';
import { ApprovalsService } from './approvals.service';
import { NotificationsService } from './notifications.service';
import { TasksService } from './tasks.service';
import { ApprovalsController, NotificationsController, TasksController } from './workflow.controller';

@Module({
  imports: [AuthModule, DocumentsModule],
  controllers: [TasksController, ApprovalsController, NotificationsController],
  providers: [TasksService, ApprovalsService, NotificationsService, AlarmsService],
  exports: [TasksService, NotificationsService],
})
export class WorkflowModule {}
