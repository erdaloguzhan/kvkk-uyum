import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ALL_PERMISSIONS, Permission, PERMISSIONS } from '@kvkk/shared';
import { and, count, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import {
  AuthUser,
  CurrentOrg,
  CurrentUser,
  OrgContext,
  RequirePermissions,
} from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { Database, InjectDb } from '../db/db.module';
import { memberships, roles } from '../db/schema';

const permissionList = z
  .array(z.enum(ALL_PERMISSIONS as [Permission, ...Permission[]]))
  .transform((p) => [...new Set(p)]);
const createBody = z.object({ name: z.string().trim().min(2).max(100), permissions: permissionList });
const updateBody = createBody.partial();

@Controller()
export class RolesController {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  /** Tanımlı tüm yetki anahtarları (rol düzenleme ekranı için). */
  @Get('permissions')
  permissions() {
    return { items: ALL_PERMISSIONS };
  }

  @Get('roles')
  @RequirePermissions(PERMISSIONS.USERS_READ)
  async list(@CurrentOrg() org: OrgContext) {
    const items = await this.db
      .select()
      .from(roles)
      .where(eq(roles.organizationId, org.id))
      .orderBy(roles.createdAt);
    return { items };
  }

  @Post('roles')
  @RequirePermissions(PERMISSIONS.ROLES_MANAGE)
  async create(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(createBody)) body: z.infer<typeof createBody>,
  ) {
    const [role] = await this.db
      .insert(roles)
      .values({ organizationId: org.id, key: `custom_${randomUUID()}`, ...body })
      .returning();
    await this.audit.record({
      action: 'role.created',
      organizationId: org.id,
      userId: user.id,
      entityType: 'role',
      entityId: role.id,
      metadata: { name: role.name, permissions: role.permissions },
    });
    return role;
  }

  @Patch('roles/:id')
  @RequirePermissions(PERMISSIONS.ROLES_MANAGE)
  async update(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(updateBody)) body: z.infer<typeof updateBody>,
  ) {
    await this.findCustomRole(org.id, id);
    const [role] = await this.db.update(roles).set(body).where(eq(roles.id, id)).returning();
    await this.audit.record({
      action: 'role.updated',
      organizationId: org.id,
      userId: user.id,
      entityType: 'role',
      entityId: id,
      metadata: body,
    });
    return role;
  }

  @Delete('roles/:id')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.ROLES_MANAGE)
  async remove(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.findCustomRole(org.id, id);
    const [{ n }] = await this.db
      .select({ n: count() })
      .from(memberships)
      .where(eq(memberships.roleId, id));
    if (n > 0) throw new ConflictException('Bu rol kullanıcılara atanmış, önce rollerini değiştirin');
    await this.db.delete(roles).where(eq(roles.id, id));
    await this.audit.record({
      action: 'role.deleted',
      organizationId: org.id,
      userId: user.id,
      entityType: 'role',
      entityId: id,
    });
  }

  private async findCustomRole(orgId: string, id: string) {
    const [role] = await this.db
      .select()
      .from(roles)
      .where(and(eq(roles.id, id), eq(roles.organizationId, orgId)));
    if (!role) throw new NotFoundException('Rol bulunamadı');
    if (role.isSystem) throw new BadRequestException('Sistem rolleri değiştirilemez');
    return role;
  }
}
