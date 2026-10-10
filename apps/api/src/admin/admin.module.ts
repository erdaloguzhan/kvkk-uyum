import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { TemplatesModule } from '../templates/templates.module';
import { AdminOrganizationsService } from './admin-organizations.service';
import { AdminController } from './admin.controller';
import { PlatformAdminGuard } from './platform-admin.guard';
import { PlatformAdminSeeder } from './platform-admin.seeder';

@Module({
  imports: [AuthModule, OrganizationsModule, TemplatesModule],
  controllers: [AdminController],
  providers: [AdminOrganizationsService, PlatformAdminGuard, PlatformAdminSeeder],
})
export class AdminModule {}
