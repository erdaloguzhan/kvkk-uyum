import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { RequestFormController, RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';

/** İlgili kişi başvuruları: herkese açık FRM-010 formu ve kuruluş panelindeki başvuru takibi. */
@Module({
  imports: [AuthModule, WorkflowModule],
  controllers: [RequestFormController, RequestsController],
  providers: [RequestsService],
})
export class RequestsModule {}
