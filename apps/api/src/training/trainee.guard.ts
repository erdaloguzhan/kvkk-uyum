import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AppRequest } from '../common/request-context';
import { PortalAuthService, TraineeToken } from './portal-auth.service';

type TraineeRequest = AppRequest & { trainee?: TraineeToken };

const ALLOW_PASSWORD_CHANGE_PENDING = 'allowPasswordChangePending';
/** Geçici şifreyle girmiş (şifresini henüz değiştirmemiş) katılımcının da çağırabileceği uç nokta. */
export const AllowPendingPasswordChange = () => SetMetadata(ALLOW_PASSWORD_CHANGE_PENDING, true);

export const CurrentTrainee = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<TraineeRequest>().trainee!,
);

/**
 * Eğitim portalı oturumu (katılımcı). Yönetim/müşteri ekranlarının belirteçleri burada geçmez,
 * katılımcı belirteci de diğer uç noktalarda geçmez (`typ` alanı).
 */
@Injectable()
export class TraineeGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly auth: PortalAuthService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<TraineeRequest>();
    const [scheme, token] = (req.headers.authorization ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException();
    let payload: TraineeToken;
    try {
      payload = await this.jwt.verifyAsync<TraineeToken>(token);
    } catch {
      throw new UnauthorizedException();
    }
    if (payload.typ !== 'trainee' || !payload.sid) throw new UnauthorizedException();
    const account = await this.auth.findById(payload.sub);
    const allowPending = this.reflector.getAllAndOverride<boolean>(ALLOW_PASSWORD_CHANGE_PENDING, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (account.mustChangePassword && !allowPending) {
      throw new ForbiddenException({ message: 'Devam etmeden önce şifrenizi değiştirin', code: 'PASSWORD_CHANGE_REQUIRED' });
    }
    req.trainee = payload;
    return true;
  }
}
