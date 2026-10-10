import { Body, Controller, Get, HttpCode, Patch, Post } from '@nestjs/common';
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
import { OrganizationsService } from './organizations.service';

export const optionalText = (max: number) => z.string().trim().max(max).nullish();
export const profileFields = {
  name: z.string().trim().min(2).max(300),
  address: optionalText(1000),
  email: z.email().max(254).nullish(),
  phone: optionalText(40),
  kepAddress: z.email().max(254).nullish(),
  authorizedPerson: optionalText(200),
  // Vergi kimlik no (10 hane) veya şahıs şirketleri için TC kimlik no (11 hane).
  taxNumber: z.string().trim().regex(/^\d{10,11}$/, 'Vergi numarası 10 veya 11 haneli olmalı').nullish(),
  website: optionalText(300),
};
const updateBody = z.object(profileFields).partial().refine((v) => Object.keys(v).length > 0, {
  message: 'Güncellenecek alan yok',
});

@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly orgs: OrganizationsService) {}

  @Get('current')
  @RequirePermissions(PERMISSIONS.ORG_READ)
  current(@CurrentOrg() org: OrgContext) {
    return this.orgs.get(org.id);
  }

  @Patch('current')
  @RequirePermissions(PERMISSIONS.ORG_MANAGE)
  update(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(updateBody)) body: z.infer<typeof updateBody>,
  ) {
    return this.orgs.update(org.id, user.id, body);
  }

  @Post('current/complete-setup')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.ORG_MANAGE)
  completeSetup(@CurrentOrg() org: OrgContext, @CurrentUser() user: AuthUser) {
    return this.orgs.completeSetup(org.id, user.id);
  }
}
