import { Global, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AuthModule } from '../auth/auth.module';
import { ErrorAlertFilter } from './error-alert.filter';
import { ErrorAlertsService } from './error-alerts.service';

/** Sistem uyarıları; arka plan işleri de (ör. alarm taraması) hatalarını buraya bildirir. */
@Global()
@Module({
  imports: [AuthModule],
  providers: [
    ErrorAlertsService,
    // Nest yanıtı yazacak HTTP sunucusunu filtreye kendisi verir (BaseExceptionFilter).
    { provide: APP_FILTER, useClass: ErrorAlertFilter },
  ],
  exports: [ErrorAlertsService],
})
export class MonitoringModule {}
