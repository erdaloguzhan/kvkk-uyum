import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { PERMISSIONS } from '@kvkk/shared';
import type { Response } from 'express';
import { z } from 'zod';
import {
  AuthUser,
  CurrentOrg,
  CurrentUser,
  OrgContext,
  RequirePermissions,
} from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { DocumentsService } from './documents.service';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const createBody = z.object({ templateCode: z.string().trim().min(1).max(30) });
const noteBody = z.object({ note: z.string().trim().max(1000).nullish() }).default({});

/** Taslak sürümleri yalnızca doküman düzenleme yetkisi olanlar görür. */
const canSeeDrafts = (org: OrgContext) => org.permissions.includes(PERMISSIONS.DOCUMENTS_WRITE);

@Controller()
export class DocumentsController {
  constructor(private readonly docs: DocumentsService) {}

  @Get('document-templates')
  @RequirePermissions(PERMISSIONS.DOCUMENTS_READ)
  async templates(@CurrentOrg() org: OrgContext) {
    return { items: await this.docs.catalog(org.id) };
  }

  @Get('documents')
  @RequirePermissions(PERMISSIONS.DOCUMENTS_READ)
  async list(@CurrentOrg() org: OrgContext) {
    return { items: await this.docs.list(org.id, canSeeDrafts(org)) };
  }

  @Post('documents')
  @RequirePermissions(PERMISSIONS.DOCUMENTS_WRITE)
  create(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(createBody)) body: z.infer<typeof createBody>,
  ) {
    return this.docs.createFromTemplate(org.id, user.id, body.templateCode);
  }

  /** Opsiyonel olmayan tüm şablonlardan kuruluşun dokümanlarını oluşturur. */
  @Post('documents/setup')
  @RequirePermissions(PERMISSIONS.DOCUMENTS_WRITE)
  setup(@CurrentOrg() org: OrgContext, @CurrentUser() user: AuthUser) {
    return this.docs.setupDefaults(org.id, user.id);
  }

  @Get('documents/:id')
  @RequirePermissions(PERMISSIONS.DOCUMENTS_READ)
  get(@CurrentOrg() org: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.docs.get(org.id, id, canSeeDrafts(org));
  }

  /** Şablonu kuruluşun güncel bilgileriyle yeniden doldurur (ör. adres değiştiğinde). */
  @Post('documents/:id/regenerate')
  @RequirePermissions(PERMISSIONS.DOCUMENTS_WRITE)
  regenerate(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(noteBody)) body: z.infer<typeof noteBody>,
  ) {
    return this.docs.regenerate(org.id, user.id, id, body.note);
  }

  /** Düzenlenmiş Word dosyasını (`file` alanı, multipart) yeni taslak sürüm olarak yükler. */
  @Post('documents/:id/versions')
  @RequirePermissions(PERMISSIONS.DOCUMENTS_WRITE)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  upload(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body(new ZodPipe(noteBody)) body: z.infer<typeof noteBody>,
  ) {
    if (!file) throw new BadRequestException('Dosya gerekli');
    return this.docs.upload(org.id, user.id, id, file.buffer, body.note);
  }

  @Post('documents/:id/versions/:versionId/publish')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.DOCUMENTS_APPROVE)
  publish(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
  ) {
    return this.docs.publish(org.id, user.id, id, versionId);
  }

  @Get('documents/:id/versions/:versionId/file')
  @RequirePermissions(PERMISSIONS.DOCUMENTS_READ)
  async download(
    @CurrentOrg() org: OrgContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Res() res: Response,
  ) {
    const version = await this.docs.file(org.id, id, versionId, canSeeDrafts(org));
    const asciiName = version.fileName.normalize('NFKD').replace(/[^\x20-\x7e]/g, '').replace(/"/g, '');
    res
      .type(DOCX_MIME)
      .set(
        'Content-Disposition',
        `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(version.fileName)}`,
      )
      .send(version.content);
  }
}
