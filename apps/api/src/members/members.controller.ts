import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { PERMISSIONS } from '@kvkk/shared';
import { z } from 'zod';
import {
  AuthUser,
  CurrentOrg,
  CurrentUser,
  OrgContext,
  RequirePermissions,
} from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { MembersService } from './members.service';

const addBody = z.object({
  email: z.email().max(254),
  fullName: z.string().trim().min(2).max(200),
  roleId: z.uuid(),
});
const updateBody = z
  .object({ roleId: z.uuid(), status: z.enum(['active', 'disabled']) })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Güncellenecek alan yok' });

@Controller('members')
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.USERS_READ)
  async list(@CurrentOrg() org: OrgContext) {
    return { items: await this.members.list(org.id) };
  }

  @Post()
  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  add(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(addBody)) body: z.infer<typeof addBody>,
  ) {
    return this.members.add(org.id, user.id, body);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  update(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(updateBody)) body: z.infer<typeof updateBody>,
  ) {
    return this.members.update(org.id, user.id, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  remove(@CurrentOrg() org: OrgContext, @CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.members.remove(org.id, user.id, id);
  }
}
