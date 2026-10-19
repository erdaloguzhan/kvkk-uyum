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
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { z } from 'zod';
import { PlatformAdminGuard } from '../admin/platform-admin.guard';
import { AuthUser, CurrentUser } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { employeesTemplateXlsx } from './employees-import';
import { EmployeesService } from './employees.service';
import { PortalDocumentsService } from './portal-documents.service';
import { sendFile, XLSX_MIME } from './files';
import { employeeBody } from './training.schema';

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const importQuery = z.object({ dryRun: z.enum(['true', 'false']).default('false') });
const portalAccessBody = z.object({ employeeIds: z.array(z.uuid()).min(1).max(5000).optional() }).default({});

/** Kuruluş (müşteri) çalışanları: yönetim panelinde kuruluş sayfasından, yalnızca platform yöneticisi. */
@Controller('admin/organizations/:orgId/employees')
@UseGuards(PlatformAdminGuard)
export class EmployeesController {
  constructor(
    private readonly employees: EmployeesService,
    private readonly portalDocuments: PortalDocumentsService,
  ) {}

  @Get()
  async list(@Param('orgId', ParseUUIDPipe) orgId: string) {
    return { items: await this.employees.list(orgId) };
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Body(new ZodPipe(employeeBody)) body: z.infer<typeof employeeBody>,
  ) {
    return this.employees.create(user.id, orgId, body);
  }

  /** Boş Excel içe aktarma şablonu. */
  @Get('import-template')
  async template(@Res() res: Response) {
    sendFile(res, await employeesTemplateXlsx(), 'Çalışan listesi şablonu.xlsx', XLSX_MIME);
  }

  /** Excel'den içe aktarma (`file` alanında .xlsx). `?dryRun=true` yalnızca denetler. */
  @Post('import')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  import(
    @CurrentUser() user: AuthUser,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Query(new ZodPipe(importQuery)) query: z.infer<typeof importQuery>,
  ) {
    if (!file) throw new BadRequestException('Dosya gerekli');
    return this.employees.import(user.id, orgId, file.buffer, query.dryRun === 'true');
  }

  /**
   * Çalışanlara Eğitim Portalı erişimi gönderir; çalışan yayınlanmış KVKK dokümanlarını portalda okur.
   * `employeeIds` verilmezse e-postası olan tüm çalışanlara gönderilir.
   */
  @Post('portal-access')
  @HttpCode(200)
  sendPortalAccess(
    @CurrentUser() user: AuthUser,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Body(new ZodPipe(portalAccessBody)) body: z.infer<typeof portalAccessBody>,
  ) {
    return this.portalDocuments.sendAccess(user.id, orgId, body.employeeIds);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(employeeBody.partial())) body: Partial<z.infer<typeof employeeBody>>,
  ) {
    return this.employees.update(user.id, orgId, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param('orgId', ParseUUIDPipe) orgId: string, @Param('id', ParseUUIDPipe) id: string) {
    await this.employees.remove(user.id, orgId, id);
  }
}
