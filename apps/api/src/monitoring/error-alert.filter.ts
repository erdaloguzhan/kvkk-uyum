import { ArgumentsHost, Catch, HttpException } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import type { Request } from 'express';
import { ErrorAlertsService } from './error-alerts.service';

/**
 * Yanıtı Nest'in varsayılan davranışıyla döner (istemci hata ayrıntısını görmez); beklenmeyen hataları
 * (HTTP hatası olmayan veya 500 ve üstü) uyarı servisine bildirir.
 */
@Catch()
export class ErrorAlertFilter extends BaseExceptionFilter {
  constructor(private readonly alerts: ErrorAlertsService) {
    super();
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    if (status >= 500 && host.getType() === 'http') {
      const req = host.switchToHttp().getRequest<Request>();
      // Yol kimlikleri içerebilir ama kişisel veri içermez; istek gövdesi ve sorgu dizesi eklenmez.
      this.alerts.reportError(`${req.method} ${req.path}`, exception);
    }
    super.catch(exception, host);
  }
}
