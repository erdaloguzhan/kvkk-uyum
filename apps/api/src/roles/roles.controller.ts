import { Controller, Get } from '@nestjs/common';
import { ALL_PERMISSIONS, PERMISSIONS, SYSTEM_ROLES } from '@kvkk/shared';
import { eq } from 'drizzle-orm';
import { CurrentOrg, OrgContext, RequirePermissions } from '../common/request-context';
import { Database, InjectDb } from '../db/db.module';
import { roles } from '../db/schema';

const roleOrder = (key: string) => SYSTEM_ROLES.findIndex((r) => r.key === key);

/** Roller sabittir (SYSTEM_ROLES); kuruluşlar özel rol tanımlayamaz, yalnızca kullanıcıya atar. */
@Controller()
export class RolesController {
  constructor(@InjectDb() private readonly db: Database) {}

  /** Tanımlı tüm yetki anahtarları. */
  @Get('permissions')
  permissions() {
    return { items: ALL_PERMISSIONS };
  }

  @Get('roles')
  @RequirePermissions(PERMISSIONS.USERS_READ)
  async list(@CurrentOrg() org: OrgContext) {
    const items = await this.db.select().from(roles).where(eq(roles.organizationId, org.id));
    return { items: items.sort((a, b) => roleOrder(a.key) - roleOrder(b.key)) };
  }
}
