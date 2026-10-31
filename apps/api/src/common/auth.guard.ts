import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { eq } from 'drizzle-orm';
import { Database, InjectDb } from '../db/db.module';
import { users } from '../db/schema';
import { AppRequest, IS_PUBLIC } from './request-context';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    @InjectDb() private readonly db: Database,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<AppRequest>();
    const [scheme, token] = (req.headers.authorization ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException();
    let payload: { sub: string; email: string; typ: string; iat?: number; iatMs?: number };
    try {
      payload = await this.jwt.verifyAsync(token);
    } catch {
      throw new UnauthorizedException();
    }
    if (payload.typ !== 'access') throw new UnauthorizedException();

    // Belirteç 15 dakika geçerlidir; pasif yapılan hesap veya şifresi değişen hesabın eski oturumu bu süreyi
    // beklemeden kapanır. Şifre değiştiren oturuma hemen sonra verilen yeni belirteç geçerli kalır.
    const [user] = await this.db
      .select({ isActive: users.isActive, sessionsRevokedAt: users.sessionsRevokedAt })
      .from(users)
      .where(eq(users.id, payload.sub));
    if (!user?.isActive) throw new UnauthorizedException();
    const issuedAtMs = payload.iatMs ?? (payload.iat ?? 0) * 1000;
    if (user.sessionsRevokedAt && issuedAtMs < user.sessionsRevokedAt.getTime()) {
      throw new UnauthorizedException();
    }
    req.user = { id: payload.sub, email: payload.email };
    return true;
  }
}
