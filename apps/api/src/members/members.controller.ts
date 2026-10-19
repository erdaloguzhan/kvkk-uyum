import { Controller, Get } from '@nestjs/common';
import { PERMISSIONS } from '@kvkk/shared';
import { CurrentOrg, OrgContext, RequirePermissions } from '../common/request-context';
import { MembersService } from './members.service';

/** Kuruluşun kullanıcıları (görev ve onay atamaları için). Ekleme ve değiştirme yönetim panelindedir. */
@Controller('members')
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.USERS_READ)
  async list(@CurrentOrg() org: OrgContext) {
    return { items: await this.members.list(org.id) };
  }
}
