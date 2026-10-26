import { CanActivate, createParamDecorator, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AppRequest } from '../common/request-context';
import { PortalAuthService, TraineeToken } from './portal-auth.service';

type TraineeRequest = AppRequest & { trainee?: TraineeToken };

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
    if (payload.typ !== 'trainee' || !payload.sid || !payload.sub) throw new UnauthorizedException();
    // Telefon çalışan kayıtlarından kaldırıldıysa oturum da geçersizdir.
    if (!(await this.auth.isKnown(payload.sub))) throw new UnauthorizedException();
    req.trainee = payload;
    return true;
  }
}
