import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Permission } from '@kvkk/shared';
import type { Request } from 'express';

export interface AuthUser {
  id: string;
  email: string;
}

export interface OrgContext {
  id: string;
  roleKey: string;
  permissions: Permission[];
}

export interface AppRequest extends Request {
  user?: AuthUser;
  org?: OrgContext;
}

export const IS_PUBLIC = 'isPublic';
/** Kimlik doğrulama gerektirmeyen uç nokta. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const ORG_PERMISSIONS = 'orgPermissions';
/**
 * Uç nokta bir kuruluş bağlamında çalışır (`X-Organization-Id` başlığı) ve
 * kullanıcının o kuruluştaki rolü verilen yetkilerin tümünü içermelidir.
 */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(ORG_PERMISSIONS, permissions);

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<AppRequest>().user!,
);

export const CurrentOrg = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<AppRequest>().org!,
);

export function clientInfo(req: Request) {
  return { ip: req.ip ?? null, userAgent: req.get('user-agent') ?? null };
}
