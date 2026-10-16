import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { and, eq } from 'drizzle-orm';
import { AppRequest } from '../common/request-context';
import { Database, InjectDb } from '../db/db.module';
import { trainers, users } from '../db/schema';

const ADMIN_ONLY = 'trainingAdminOnly';
/** Eğitim yönetiminde yalnızca platform yöneticisinin yapabileceği işlem (ör. eğitimci ekleme). */
export const PlatformAdminOnly = () => SetMetadata(ADMIN_ONLY, true);

/**
 * Eğitim yönetimi uç noktaları: platform yöneticileri ve aktif eğitimciler erişir (pasif eğitimci erişemez).
 */
@Injectable()
export class TrainingStaffGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectDb() private readonly db: Database,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AppRequest>();
    if (!req.user) throw new ForbiddenException();
    const [user] = await this.db
      .select({ isPlatformAdmin: users.isPlatformAdmin, trainerActive: trainers.isActive })
      .from(users)
      .leftJoin(trainers, eq(trainers.userId, users.id))
      .where(and(eq(users.id, req.user.id), eq(users.isActive, true)));
    const adminOnly = this.reflector.getAllAndOverride<boolean>(ADMIN_ONLY, [ctx.getHandler(), ctx.getClass()]);
    if (user?.isPlatformAdmin) return true;
    if (user?.trainerActive && !adminOnly) return true;
    throw new ForbiddenException(
      adminOnly ? 'Bu işlem yalnızca platform yöneticilerine açıktır' : 'Bu sayfa yalnızca eğitimcilere ve platform yöneticilerine açıktır',
    );
  }
}
