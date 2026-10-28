import { Module } from '@nestjs/common';
import { WorkflowModule } from '../workflow/workflow.module';
import { DestructionController } from './destruction.controller';
import { DestructionService } from './destruction.service';

@Module({
  imports: [WorkflowModule],
  controllers: [DestructionController],
  providers: [DestructionService],
})
export class DestructionModule {}
