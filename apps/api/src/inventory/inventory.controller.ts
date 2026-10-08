import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { PERMISSIONS } from '@kvkk/shared';
import type { Response } from 'express';
import { z } from 'zod';
import { AuthUser, CurrentOrg, CurrentUser, OrgContext, RequirePermissions } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { InventoryService } from './inventory.service';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Boş metin "girilmedi" (null) olarak saklanır. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null);
const requiredText = z.string().trim().min(1).max(200);
/** Çoklu seçim: boşlar atılır, tekrar edenler birleştirilir. */
const list = z
  .array(z.string().trim().max(2000))
  .max(100)
  .transform((items) => [...new Set(items.filter(Boolean))]);

const fields = {
  department: requiredText,
  activity: requiredText,
  dataCategory: requiredText,
  personalData: optionalText(5000),
  specialCategoryData: optionalText(5000),
  purposes: list,
  storageMedium: z.enum(['physical', 'digital', 'both']).nullish().transform((v) => v ?? null),
  storageLocation: optionalText(1000),
  dataSubjectGroups: list,
  legalBases: list,
  relatedLegislation: optionalText(2000),
  retentionPeriod: optionalText(500),
  recipients: list,
  foreignTransfers: optionalText(5000),
  administrativeMeasures: list,
  technicalMeasures: list,
};

const createBody = z.object(fields).partial().extend({
  department: fields.department,
  activity: fields.activity,
  dataCategory: fields.dataCategory,
});
const updateBody = z
  .object(fields)
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Güncellenecek alan yok' });
const listQuery = z.object({
  department: z.string().trim().max(200).optional(),
  dataCategory: z.string().trim().max(200).optional(),
  incomplete: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  /** Adım adım giriş için sütunlar, zorunlu alanlar ve öneri listeleri. */
  @Get('options')
  @RequirePermissions(PERMISSIONS.INVENTORY_READ)
  options(@CurrentOrg() org: OrgContext) {
    return this.inventory.options(org.id);
  }

  @Get('summary')
  @RequirePermissions(PERMISSIONS.INVENTORY_READ)
  summary(@CurrentOrg() org: OrgContext) {
    return this.inventory.summary(org.id);
  }

  /** Envanteri TBL-010 biçiminde Excel olarak indirir. */
  @Get('export')
  @RequirePermissions(PERMISSIONS.INVENTORY_READ)
  async export(@CurrentOrg() org: OrgContext, @CurrentUser() user: AuthUser, @Res() res: Response) {
    const file = await this.inventory.exportXlsx(org.id, user.id);
    const name = `TBL-010 Kişisel Veri Envanteri Tablosu - ${new Date().toISOString().slice(0, 10)}.xlsx`;
    const asciiName = name.normalize('NFKD').replace(/[^\x20-\x7e]/g, '');
    res
      .type(XLSX_MIME)
      .set('Content-Disposition', `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(name)}`)
      .send(file);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.INVENTORY_READ)
  async list(@CurrentOrg() org: OrgContext, @Query(new ZodPipe(listQuery)) query: z.infer<typeof listQuery>) {
    return { items: await this.inventory.list(org.id, query) };
  }

  @Post()
  @RequirePermissions(PERMISSIONS.INVENTORY_WRITE)
  create(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(createBody)) body: z.infer<typeof createBody>,
  ) {
    return this.inventory.create(org.id, user.id, body);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.INVENTORY_READ)
  get(@CurrentOrg() org: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.inventory.get(org.id, id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.INVENTORY_WRITE)
  update(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(updateBody)) body: z.infer<typeof updateBody>,
  ) {
    return this.inventory.update(org.id, user.id, id, body);
  }

  @Post(':id/duplicate')
  @RequirePermissions(PERMISSIONS.INVENTORY_WRITE)
  duplicate(@CurrentOrg() org: OrgContext, @CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.inventory.duplicate(org.id, user.id, id);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.INVENTORY_WRITE)
  async remove(@CurrentOrg() org: OrgContext, @CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.inventory.remove(org.id, user.id, id);
  }
}
