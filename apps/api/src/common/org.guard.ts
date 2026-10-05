import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Permission } from '@kvkk/shared';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { Database, InjectDb } from '../db/db.module';
import { memberships, roles } from '../db/schema';
import { AppRequest, ORG_PERMISSIONS } from './request-context';

export const ORG_HEADER = 'x-organization-id';

@Injectable()
export class OrgGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectDb() private readonly db: Database,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(ORG_PERMISSIONS, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required) return true;

    const req = ctx.switchToHttp().getRequest<AppRequest>();
    const orgId = req.headers[ORG_HEADER];
    if (typeof orgId !== 'string' || !z.uuid().safeParse(orgId).success) {
      throw new BadRequestException(`${ORG_HEADER} başlığı gerekli`);
    }

    const [row] = await this.db
      .select({ roleKey: roles.key, permissions: roles.permissions })
      .from(memberships)
      .innerJoin(roles, eq(roles.id, memberships.roleId))
      .where(
        and(
          eq(memberships.userId, req.user!.id),
          eq(memberships.organizationId, orgId),
          eq(memberships.status, 'active'),
        ),
      );
    if (!row) throw new ForbiddenException('Bu kuruluşa erişiminiz yok');

    const granted = row.permissions as Permission[];
    if (!required.every((p) => granted.includes(p))) {
      throw new ForbiddenException('Bu işlem için yetkiniz yok');
    }
    req.org = { id: orgId, roleKey: row.roleKey, permissions: granted };
    return true;
  }
}
