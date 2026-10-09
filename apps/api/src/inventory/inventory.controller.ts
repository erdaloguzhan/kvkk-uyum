import {
  BadRequestException,
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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { PERMISSIONS } from '@kvkk/shared';
import type { Response } from 'express';
import { z } from 'zod';
import { AuthUser, CurrentOrg, CurrentUser, OrgContext, RequirePermissions } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { createBody, updateBody } from './inventory.schema';
import { InventoryService } from './inventory.service';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

const importQuery = z.object({
  mode: z.enum(['append', 'replace']).default('append'),
  dryRun: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

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

  /**
   * TBL-010 biçimindeki Excel'i (`file` alanı, multipart) içe aktarır.
   * `dryRun=true` kaydetmeden kontrol eder; `mode=replace` mevcut envanteri silip dosyadakilerle değiştirir.
   */
  @Post('import')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.INVENTORY_WRITE)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMPORT_BYTES, files: 1 } }))
  import(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Query(new ZodPipe(importQuery)) query: z.infer<typeof importQuery>,
  ) {
    if (!file) throw new BadRequestException('Dosya gerekli');
    return this.inventory.importXlsx(org.id, user.id, file.buffer, query);
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
