import { Module } from '@nestjs/common';
import { PlatformAdminGuard } from '../admin/platform-admin.guard';
import { AuthModule } from '../auth/auth.module';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';
import { ExportController } from './export.controller';
import { GroupsService } from './groups.service';
import { PortalAuthService } from './portal-auth.service';
import { PortalService } from './portal.service';
import { TraineeGuard } from './trainee.guard';
import { TrainersService } from './trainers.service';
import { TrainingAdminController } from './training-admin.controller';
import { TrainingMediaController } from './training-media.controller';
import { TrainingPortalController } from './training-portal.controller';
import { TrainingStaffGuard } from './training-staff.guard';
import { TrainingsService } from './trainings.service';

/** Uzaktan eğitim: çalışanlar, eğitimciler, eğitim içerikleri, gruplar, sınavlar, sertifika ve katılımcı portalı. */
@Module({
  imports: [AuthModule],
  controllers: [EmployeesController, TrainingAdminController, TrainingPortalController, TrainingMediaController, ExportController],
  providers: [
    EmployeesService,
    TrainersService,
    TrainingsService,
    GroupsService,
    PortalAuthService,
    PortalService,
    TrainingStaffGuard,
    TraineeGuard,
    PlatformAdminGuard,
  ],
})
export class TrainingModule {}
