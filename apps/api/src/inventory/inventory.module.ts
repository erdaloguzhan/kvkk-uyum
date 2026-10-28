import { Module } from '@nestjs/common';
import { PlatformAdminGuard } from '../admin/platform-admin.guard';
import { WorkflowModule } from '../workflow/workflow.module';
import { InventoryApprovalsService } from './inventory-approvals.service';
import { InventoryTemplateController } from './inventory-template.controller';
import { InventoryTemplateService } from './inventory-template.service';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';

@Module({
  imports: [WorkflowModule],
  controllers: [InventoryController, InventoryTemplateController],
  providers: [InventoryService, InventoryApprovalsService, InventoryTemplateService, PlatformAdminGuard],
})
export class InventoryModule {}
