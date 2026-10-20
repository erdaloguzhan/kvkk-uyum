import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Res, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { z } from 'zod';
import { AuthUser, CurrentOrg, CurrentUser, OrgContext, RequirePermissions } from '../common/request-context';
import { AuditMode } from '../audit/audit.interceptor';
import { ZodPipe } from '../common/zod.pipe';
import { sendAttachment, toAttachments } from './files';
import { createTicketBody, uploadLimits, userListQuery, userReplyBody } from './support.schema';
import { SupportService } from './support.service';

/**
 * Kuruluş kullanıcılarının destek talepleri. Kuruluşun her aktif üyesi talep açabilir; kullanıcı kendi
 * taleplerini, KVKK Sorumlusu kuruluşun tüm taleplerini görür.
 */
@Controller('support')
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Get('tickets')
  @RequirePermissions()
  async list(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Query(new ZodPipe(userListQuery)) query: z.infer<typeof userListQuery>,
  ) {
    return { items: await this.support.listForUser(org.id, user.id, org.permissions, query.status) };
  }

  /** Çok parçalı form: subject, category, body ve `files` alanında en fazla 5 ek. */
  @Post('tickets')
  @RequirePermissions()
  @UseInterceptors(FilesInterceptor('files', undefined, uploadLimits))
  create(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @Body(new ZodPipe(createTicketBody)) body: z.infer<typeof createTicketBody>,
  ) {
    return this.support.create(org.id, user.id, body, toAttachments(files));
  }

  // Aşağıdakiler kuruluş başlığı istemez: erişim talebin kuruluşundaki üyelikten kontrol edilir
  // (e-postadaki bağlantı, kullanıcı başka kuruluşu seçmişken de açılabilsin).

  @Get('tickets/:id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.support.getForUser(user.id, id);
  }

  @Post('tickets/:id/messages')
  @UseInterceptors(FilesInterceptor('files', undefined, uploadLimits))
  reply(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @Body(new ZodPipe(userReplyBody)) body: z.infer<typeof userReplyBody>,
  ) {
    return this.support.replyAsUser(user.id, id, body.body, toAttachments(files));
  }

  @Post('tickets/:id/close')
  @HttpCode(200)
  close(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.support.closeAsUser(user.id, id);
  }

  /** Ek dosyası (talebi görebilen kullanıcı veya platform yöneticisi). */
  @AuditMode('access')
  @Get('attachments/:id')
  async attachment(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    sendAttachment(res, await this.support.attachment(user.id, id));
  }
}
