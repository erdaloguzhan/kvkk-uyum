import { Module } from '@nestjs/common';
import { WorkflowModule } from '../workflow/workflow.module';
import { IncidentsController } from './incidents.controller';
import { IncidentsService } from './incidents.service';

@Module({
  imports: [WorkflowModule],
  controllers: [IncidentsController],
  providers: [IncidentsService],
})
export class IncidentsModule {}
