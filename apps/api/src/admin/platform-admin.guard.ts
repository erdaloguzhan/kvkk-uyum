import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { AppRequest } from '../common/request-context';
import { Database, InjectDb } from '../db/db.module';
import { users } from '../db/schema';

/** Yalnızca platform yöneticilerinin (yönetim paneli) erişebileceği uç noktalar için. */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(@InjectDb() private readonly db: Database) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AppRequest>();
    if (!req.user) throw new ForbiddenException();
    const [user] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, req.user.id), eq(users.isPlatformAdmin, true), eq(users.isActive, true)));
    if (!user) throw new ForbiddenException('Bu sayfa yalnızca platform yöneticilerine açıktır');
    return true;
  }
}
