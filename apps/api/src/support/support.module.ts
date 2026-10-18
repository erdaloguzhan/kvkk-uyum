import { Module } from '@nestjs/common';
import { PlatformAdminGuard } from '../admin/platform-admin.guard';
import { AuthModule } from '../auth/auth.module';
import { SupportAdminController } from './support-admin.controller';
import { SupportController } from './support.controller';
import { SupportService } from './support.service';

/** Destek talepleri: kuruluş kullanıcılarının talepleri ve yönetim panelindeki destek kutusu. */
@Module({
  imports: [AuthModule],
  controllers: [SupportController, SupportAdminController],
  providers: [SupportService, PlatformAdminGuard],
})
export class SupportModule {}
