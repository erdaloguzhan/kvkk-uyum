import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { z } from 'zod';
import { PlatformAdminGuard } from '../admin/platform-admin.guard';
import { AuthUser, CurrentUser } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { toAttachments } from './files';
import { adminListQuery, adminUpdateBody, staffReplyBody, uploadLimits } from './support.schema';
import { SupportService } from './support.service';

/** Yönetim paneli: tüm kuruluşların destek talepleri. Yalnızca platform yöneticileri. */
@Controller('admin/support')
@UseGuards(PlatformAdminGuard)
export class SupportAdminController {
  constructor(private readonly support: SupportService) {}

  @Get('tickets')
  async list(@CurrentUser() user: AuthUser, @Query(new ZodPipe(adminListQuery)) query: z.infer<typeof adminListQuery>) {
    return { items: await this.support.adminList(user.id, query) };
  }

  @Get('summary')
  summary(@CurrentUser() user: AuthUser) {
    return this.support.adminSummary(user.id);
  }

  @Get('staff')
  async staff() {
    return { items: await this.support.staff() };
  }

  @Get('tickets/:id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.support.adminGet(id);
  }

  /** Çok parçalı form: body, close ("true": yanıtla ve kapat) ve `files` alanında ekler. */
  @Post('tickets/:id/messages')
  @UseInterceptors(FilesInterceptor('files', undefined, uploadLimits))
  reply(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @Body(new ZodPipe(staffReplyBody)) body: z.infer<typeof staffReplyBody>,
  ) {
    return this.support.replyAsStaff(user.id, id, body.body, toAttachments(files), body.close);
  }

  /** Sorumlu atama ve durum değiştirme (kapatma / yeniden açma). */
  @Patch('tickets/:id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(adminUpdateBody)) body: z.infer<typeof adminUpdateBody>,
  ) {
    return this.support.adminUpdate(user.id, id, body);
  }
}
