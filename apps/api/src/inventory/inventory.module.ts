import { Module } from '@nestjs/common';
import { WorkflowModule } from '../workflow/workflow.module';
import { InventoryApprovalsService } from './inventory-approvals.service';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';

@Module({
  imports: [WorkflowModule],
  controllers: [InventoryController],
  providers: [InventoryService, InventoryApprovalsService],
})
export class InventoryModule {}
