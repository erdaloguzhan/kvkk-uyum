import { CallHandler, ExecutionContext, Injectable, NestInterceptor, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { mergeMap, Observable } from 'rxjs';
import { AppRequest, clientInfo } from '../common/request-context';
import { auditContext, AuditRequestContext } from './audit-context';
import { AuditService } from './audit.service';

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const AUDIT_MODE = 'auditMode';
/**
 * `access`: veri değiştirmeyen ama kayıt altına alınması gereken istek (dosya indirme gibi) de loglanır.
 * `skip`: kullanıcı işlemi olmayan otomatik istek (oturum yenileme) loglanmaz.
 */
export const AuditMode = (mode: 'access' | 'skip') => SetMetadata(AUDIT_MODE, mode);

/** `TrainingAdminController` + `createGroup` → `trainingAdmin.createGroup` */
export function fallbackAction(controller: string, handler: string) {
  const resource = controller.replace(/Controller$/, '');
  return `${resource.charAt(0).toLowerCase()}${resource.slice(1)}.${handler}`;
}

/**
 * Her isteğe IP ve tarayıcı bilgisini log bağlamı olarak taşır. Veri değiştiren (GET dışı) başarılı bir istek
 * kendi ayrıntılı log kaydını yazmadıysa genel bir kayıt yazar; böylece yapılan hiçbir işlem logsuz kalmaz.
 * İstek gövdesi kişisel veri içerebileceği için loglanmaz; yalnızca adres ve parametreler yazılır.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly audit: AuditService,
    private readonly reflector: Reflector,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() !== 'http') return next.handle();
    const req = ctx.switchToHttp().getRequest<AppRequest & { trainee?: { email: string } }>();
    const store: AuditRequestContext = { ...clientInfo(req), recorded: false };
    const mode = this.reflector.get<'access' | 'skip' | undefined>(AUDIT_MODE, ctx.getHandler());
    const logged = mode === 'access' || (mode !== 'skip' && !READ_METHODS.has(req.method));
    return new Observable((subscriber) =>
      auditContext.run(store, () =>
        next
          .handle()
          .pipe(
            mergeMap(async (value) => {
              if (logged && !store.recorded) {
                const params = { ...(req.params ?? {}) } as Record<string, string>;
                await this.audit.record({
                  action: fallbackAction(ctx.getClass().name, ctx.getHandler().name),
                  organizationId: req.org?.id ?? (UUID.test(params.orgId ?? '') ? params.orgId : null),
                  userId: req.user?.id ?? null,
                  entityId: params.id,
                  metadata: {
                    method: req.method,
                    path: req.route?.path ?? req.path,
                    ...(Object.keys(params).length ? { params } : {}),
                    ...(req.trainee ? { account: req.trainee.email } : {}),
                  },
                });
              }
              return value;
            }),
          )
          .subscribe(subscriber),
      ),
    );
  }
}
