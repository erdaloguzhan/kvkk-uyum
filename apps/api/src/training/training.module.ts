import { Module } from '@nestjs/common';
import { PlatformAdminGuard } from '../admin/platform-admin.guard';
import { AuthModule } from '../auth/auth.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { DocumentReadsController } from './document-reads.controller';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';
import { ExportController } from './export.controller';
import { GroupsService } from './groups.service';
import { PortalAuthService } from './portal-auth.service';
import { PortalDocumentsService } from './portal-documents.service';
import { PortalService } from './portal.service';
import { TraineeGuard } from './trainee.guard';
import { TrainerTasksController } from './trainer-tasks.controller';
import { TrainersService } from './trainers.service';
import { TrainingAdminController } from './training-admin.controller';
import { TrainingMediaController } from './training-media.controller';
import { TrainingPortalController } from './training-portal.controller';
import { TrainingStaffGuard } from './training-staff.guard';
import { TrainingsService } from './trainings.service';

/** Uzaktan eğitim: çalışanlar, eğitimciler, eğitim içerikleri, gruplar, sınavlar, sertifika ve katılımcı portalı. */
@Module({
  imports: [AuthModule, WorkflowModule],
  controllers: [EmployeesController, TrainingAdminController, TrainerTasksController, TrainingPortalController, TrainingMediaController, ExportController, DocumentReadsController],
  providers: [
    EmployeesService,
    TrainersService,
    TrainingsService,
    GroupsService,
    PortalAuthService,
    PortalService,
    PortalDocumentsService,
    TrainingStaffGuard,
    TraineeGuard,
    PlatformAdminGuard,
  ],
})
export class TrainingModule {}
