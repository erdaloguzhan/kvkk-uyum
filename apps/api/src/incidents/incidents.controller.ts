import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Res } from '@nestjs/common';
import { PERMISSIONS } from '@kvkk/shared';
import type { Response } from 'express';
import { z } from 'zod';
import { AuthUser, CurrentOrg, CurrentUser, OrgContext, RequirePermissions } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { sendFile } from '../training/files';
import {
  closeBody,
  createBody,
  decisionBody,
  listQuery,
  notifiedBody,
  rejectBody,
  reportQuery,
  submitBody,
  updateBody,
} from './incidents.schema';
import { IncidentsService } from './incidents.service';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

@Controller('incidents')
export class IncidentsController {
  constructor(private readonly incidents: IncidentsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.INCIDENTS_READ)
  async list(@CurrentOrg() org: OrgContext, @Query(new ZodPipe(listQuery)) query: z.infer<typeof listQuery>) {
    return { items: await this.incidents.list(org.id, query) };
  }

  @Get('report')
  @RequirePermissions(PERMISSIONS.INCIDENTS_READ)
  report(@CurrentOrg() org: OrgContext, @Query(new ZodPipe(reportQuery)) query: z.infer<typeof reportQuery>) {
    return this.incidents.report(org.id, query);
  }

  /** Yeni kayıt formunun A bölümü (kuruluş ve kullanıcı bilgileri). */
  @Get('form-defaults')
  @RequirePermissions(PERMISSIONS.INCIDENTS_MANAGE)
  formDefaults(@CurrentOrg() org: OrgContext, @CurrentUser() user: AuthUser) {
    return this.incidents.formDefaults(org.id, user.id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.INCIDENTS_MANAGE)
  create(@CurrentOrg() org: OrgContext, @CurrentUser() user: AuthUser, @Body(new ZodPipe(createBody)) body: z.infer<typeof createBody>) {
    return this.incidents.create(org.id, user.id, body);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.INCIDENTS_READ)
  get(@CurrentOrg() org: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.incidents.get(org.id, id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.INCIDENTS_MANAGE)
  update(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(updateBody)) body: z.infer<typeof updateBody>,
  ) {
    return this.incidents.update(org.id, user.id, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.INCIDENTS_MANAGE)
  async remove(@CurrentOrg() org: OrgContext, @CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.incidents.remove(org.id, user.id, id);
  }

  /** Doldurulmuş FRM-020 Kişisel Veri İhlali Bildirim Formu (Word). */
  @Get(':id/form.docx')
  @RequirePermissions(PERMISSIONS.INCIDENTS_READ)
  async formDocx(@CurrentOrg() org: OrgContext, @CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const { file, fileName } = await this.incidents.formDocx(org.id, user.id, id);
    sendFile(res, file, fileName, DOCX_MIME);
  }

  @Post(':id/submit')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.INCIDENTS_MANAGE)
  submit(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(submitBody)) body: z.infer<typeof submitBody>,
  ) {
    return this.incidents.submit(org.id, user.id, id, body);
  }

  @Post(':id/withdraw')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.INCIDENTS_MANAGE)
  withdraw(@CurrentOrg() org: OrgContext, @CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.incidents.withdraw(org.id, user.id, id);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.INCIDENTS_APPROVE)
  approve(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(decisionBody)) body: z.infer<typeof decisionBody>,
  ) {
    return this.incidents.approve(org.id, user.id, id, body.note);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.INCIDENTS_APPROVE)
  reject(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(rejectBody)) body: z.infer<typeof rejectBody>,
  ) {
    return this.incidents.reject(org.id, user.id, id, body.note);
  }

  /** Sorumlu veya Yönetici: Kurula bildirildi. */
  @Post(':id/notified')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.INCIDENTS_READ)
  notified(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(notifiedBody)) body: z.infer<typeof notifiedBody>,
  ) {
    return this.incidents.markNotified(org.id, user.id, org.permissions, id, body);
  }

  /** Sorumlu veya Yönetici: bildirim gerekmedi (gerekçeyle). */
  @Post(':id/close')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.INCIDENTS_READ)
  close(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(closeBody)) body: z.infer<typeof closeBody>,
  ) {
    return this.incidents.closeWithoutNotice(org.id, user.id, org.permissions, id, body.note);
  }

  @Post(':id/follow-up')
  @RequirePermissions(PERMISSIONS.INCIDENTS_MANAGE)
  followUp(@CurrentOrg() org: OrgContext, @CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.incidents.followUp(org.id, user.id, id);
  }
}
