import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { PERMISSIONS } from '@kvkk/shared';
import type { Response } from 'express';
import { z } from 'zod';
import { AuditMode } from '../audit/audit.interceptor';
import { CaptchaService } from '../auth/captcha.service';
import { AppRequest, AuthUser, clientInfo, CurrentOrg, CurrentUser, OrgContext, Public, RequirePermissions } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { sendAttachment, toAttachments } from '../support/files';
import { sendFile } from '../training/files';
import {
  answerBody,
  assigneeBody,
  formSettingsBody,
  listQuery,
  manualCreateBody,
  noteBody,
  publicSubmitBody,
  reportQuery,
  statusBody,
  uploadLimits,
} from './requests.schema';
import { RequestsService } from './requests.service';

const formKey = z.string().max(64);

/**
 * Herkese açık ilgili kişi başvuru formu (FRM-010). Dışarıya açık olan yalnızca bu iki uç noktadır:
 * kuruluş kodu tahmin edilemez, gönderim iş kanıtı (CAPTCHA) ve sıkı hız sınırıyla korunur.
 */
@Controller('request-form')
@Public()
export class RequestFormController {
  constructor(
    private readonly requests: RequestsService,
    private readonly captcha: CaptchaService,
  ) {}

  @Get(':key')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  form(@Param('key', new ZodPipe(formKey)) key: string) {
    return this.requests.publicForm(key);
  }

  /** Çok parçalı form: başvuru alanları, `items` (JSON), `captchaToken` ve `files` alanında en fazla 5 belge. */
  @Post(':key')
  @Throttle({ default: { limit: 5, ttl: 10 * 60_000 } })
  @UseInterceptors(FilesInterceptor('files', undefined, uploadLimits))
  async submit(
    @Req() req: AppRequest,
    @Param('key', new ZodPipe(formKey)) key: string,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @Body(new ZodPipe(publicSubmitBody)) body: z.infer<typeof publicSubmitBody>,
  ) {
    const client = clientInfo(req);
    await this.captcha.verify(body.captchaToken, client.ip);
    const { consent: _consent, captchaToken: _token, ...input } = body;
    return this.requests.submitPublic(key, input, toAttachments(files), client);
  }
}

@Controller('data-subject-requests')
export class RequestsController {
  constructor(private readonly requests: RequestsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.REQUESTS_READ)
  async list(@CurrentOrg() org: OrgContext, @Query(new ZodPipe(listQuery)) query: z.infer<typeof listQuery>) {
    return { items: await this.requests.list(org.id, { ...query, overdue: query.overdue === 'true' }) };
  }

  @Get('report')
  @RequirePermissions(PERMISSIONS.REQUESTS_READ)
  report(@CurrentOrg() org: OrgContext, @Query(new ZodPipe(reportQuery)) query: z.infer<typeof reportQuery>) {
    return this.requests.report(org.id, query);
  }

  @Get('form-settings')
  @RequirePermissions(PERMISSIONS.REQUESTS_READ)
  formSettings(@CurrentOrg() org: OrgContext) {
    return this.requests.formSettings(org.id);
  }

  @Patch('form-settings')
  @RequirePermissions(PERMISSIONS.REQUESTS_MANAGE)
  updateFormSettings(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(formSettingsBody)) body: z.infer<typeof formSettingsBody>,
  ) {
    return this.requests.updateFormSettings(org.id, user.id, body);
  }

  @Post('form-settings/regenerate')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.REQUESTS_MANAGE)
  regenerate(@CurrentOrg() org: OrgContext, @CurrentUser() user: AuthUser) {
    return this.requests.regenerateFormKey(org.id, user.id);
  }

  /** Elden, noterden, postayla vb. gelen başvurunun kaydı (çok parçalı form, `files` alanında belgeler). */
  @Post()
  @RequirePermissions(PERMISSIONS.REQUESTS_MANAGE)
  @UseInterceptors(FilesInterceptor('files', undefined, uploadLimits))
  create(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @Body(new ZodPipe(manualCreateBody)) body: z.infer<typeof manualCreateBody>,
  ) {
    return this.requests.createManual(org.id, user.id, body, toAttachments(files));
  }

  /** Ayrıntı T.C. kimlik numarasını açık gösterdiği için erişim loglanır. */
  @Get(':id')
  @AuditMode('access')
  @RequirePermissions(PERMISSIONS.REQUESTS_READ)
  get(@CurrentOrg() org: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.requests.get(org.id, id);
  }

  @Post(':id/status')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.REQUESTS_MANAGE)
  status(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(statusBody)) body: z.infer<typeof statusBody>,
  ) {
    return this.requests.setStatus(org.id, user.id, id, body.status, body.note);
  }

  @Post(':id/assignee')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.REQUESTS_MANAGE)
  reassign(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(assigneeBody)) body: z.infer<typeof assigneeBody>,
  ) {
    return this.requests.reassign(org.id, user.id, id, body.assigneeId);
  }

  @Post(':id/notes')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.REQUESTS_MANAGE)
  note(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(noteBody)) body: z.infer<typeof noteBody>,
  ) {
    return this.requests.addNote(org.id, user.id, id, body.note);
  }

  @Post(':id/files')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.REQUESTS_MANAGE)
  @UseInterceptors(FilesInterceptor('files', undefined, uploadLimits))
  addFiles(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
  ) {
    return this.requests.addFiles(org.id, user.id, id, toAttachments(files));
  }

  /** Cevap kaydı (çok parçalı form, `files` alanında isteğe bağlı cevap yazısı). */
  @Post(':id/answer')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.REQUESTS_MANAGE)
  @UseInterceptors(FilesInterceptor('files', undefined, uploadLimits))
  answer(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @Body(new ZodPipe(answerBody)) body: z.infer<typeof answerBody>,
  ) {
    return this.requests.answer(org.id, user.id, id, body, toAttachments(files));
  }

  @Get(':id/pdf')
  @AuditMode('access')
  @RequirePermissions(PERMISSIONS.REQUESTS_READ)
  async pdf(@CurrentOrg() org: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const { fileName, content } = await this.requests.pdf(org.id, id);
    sendFile(res, content, fileName, 'application/pdf');
  }

  @Get(':id/files/:fileId')
  @AuditMode('access')
  @RequirePermissions(PERMISSIONS.REQUESTS_READ)
  async file(
    @CurrentOrg() org: OrgContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @Res() res: Response,
  ) {
    sendAttachment(res, await this.requests.file(org.id, id, fileId));
  }
}
