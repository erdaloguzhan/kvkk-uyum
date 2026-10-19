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
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DOCUMENT_CATEGORIES, DocumentCategory, SYSTEM_ROLES } from '@kvkk/shared';
import type { Response } from 'express';
import { z } from 'zod';
import { AuthUser, CurrentUser } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { profileFields } from '../organizations/organizations.controller';
import { TemplatesService } from '../templates/templates.service';
import { MembersService } from '../members/members.service';
import { AdminOrganizationsService } from './admin-organizations.service';
import { PlatformAdminGuard } from './platform-admin.guard';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const createOrgBody = z.object({
  ...profileFields,
  email: z.email('Geçerli bir e-posta adresi girin').max(254),
  authorizedPerson: z.string().trim().min(2, 'KVKK Sorumlusunun adını girin').max(200),
  approver: z.object({
    email: z.email('Yöneticinin e-posta adresini girin').max(254),
    fullName: z.string().trim().min(2, 'Yöneticinin adını girin').max(200),
  }),
  viewer: z
    .object({
      email: z.email('İzleyicinin e-posta adresini girin').max(254),
      fullName: z.string().trim().min(2, 'İzleyicinin adını girin').max(200),
    })
    .nullish(),
});

const memberRoleKey = z.enum(SYSTEM_ROLES.map((r) => r.key) as [string, ...string[]]);
const addMemberBody = z.object({
  email: z.email('Geçerli bir e-posta adresi girin').max(254),
  fullName: z.string().trim().min(2).max(200),
  roleKey: memberRoleKey,
});
const updateMemberBody = z
  .object({ roleKey: memberRoleKey, status: z.enum(['active', 'disabled']) })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Güncellenecek alan yok' });

const categories = Object.keys(DOCUMENT_CATEGORIES) as [DocumentCategory, ...DocumentCategory[]];
/** Çok parçalı formdan gelen "true"/"false" değerleri. */
const formBoolean = z.preprocess((v) => (typeof v === 'string' ? v === 'true' || v === 'on' : v), z.boolean());
const note = z.string().trim().max(1000).nullish();
const createTemplateBody = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2,5}-\d{3}$/, 'Kod ör. POL-030 biçiminde olmalı'),
  title: z.string().trim().min(2).max(300),
  category: z.enum(categories),
  optional: formBoolean.default(false),
  note,
});
const updateTemplateBody = z
  .object({ title: z.string().trim().min(2).max(300), optional: z.boolean() })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Güncellenecek alan yok' });
const versionBody = z.object({ note }).default({});
const publishBody = z
  .object({ effectiveDate: z.iso.date('Tarih YYYY-AA-GG biçiminde olmalı').nullish() })
  .default({});

const fileName = (file: Express.Multer.File) =>
  // Multer dosya adını latin1 olarak çözer; Türkçe karakterler için UTF-8'e çevrilir.
  Buffer.from(file.originalname, 'latin1').toString('utf8');

/** Yönetim paneli: kuruluşlar ve ana doküman şablonları. Yalnızca platform yöneticileri. */
@Controller('admin')
@UseGuards(PlatformAdminGuard)
export class AdminController {
  constructor(
    private readonly orgs: AdminOrganizationsService,
    private readonly members: MembersService,
    private readonly templates: TemplatesService,
  ) {}

  @Get('organizations')
  async listOrganizations() {
    return { items: await this.orgs.list() };
  }

  /** Kuruluşu Sorumlu, Yönetici ve İzleyici kullanıcılarıyla oluşturur; her birine bağlantı gider. */
  @Post('organizations')
  createOrganization(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(createOrgBody)) body: z.infer<typeof createOrgBody>,
  ) {
    return this.orgs.create(user.id, body);
  }

  @Post('organizations/:id/resend-invite')
  @HttpCode(200)
  resendInvite(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.orgs.resendInvite(user.id, id);
  }

  /** Kuruluşun kullanıcıları; müşteri kuruluşlar kullanıcı ekleyemediği için buradan yönetilir. */
  @Get('organizations/:id/members')
  async listMembers(@Param('id', ParseUUIDPipe) id: string) {
    return { items: await this.members.list(id) };
  }

  @Post('organizations/:id/members')
  addMember(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(addMemberBody)) body: z.infer<typeof addMemberBody>,
  ) {
    return this.members.add(id, user.id, body);
  }

  @Patch('organizations/:id/members/:memberId')
  updateMember(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Body(new ZodPipe(updateMemberBody)) body: z.infer<typeof updateMemberBody>,
  ) {
    return this.members.update(id, user.id, memberId, body);
  }

  @Delete('organizations/:id/members/:memberId')
  @HttpCode(204)
  removeMember(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
  ) {
    return this.members.remove(id, user.id, memberId);
  }

  @Post('organizations/:id/members/:memberId/resend-invite')
  @HttpCode(200)
  resendMemberInvite(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
  ) {
    return this.members.resendInvite(id, user.id, memberId);
  }

  @Get('templates')
  async listTemplates() {
    return { items: await this.templates.adminList() };
  }

  /** Yeni ana şablon (`file` alanında .docx, çok parçalı form). İlk sürüm taslak olarak eklenir. */
  @Post('templates')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  createTemplate(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body(new ZodPipe(createTemplateBody)) body: z.infer<typeof createTemplateBody>,
  ) {
    if (!file) throw new BadRequestException('Dosya gerekli');
    const { code, note: n, ...meta } = body;
    return this.templates.create(user.id, code, meta, file.buffer, fileName(file), n);
  }

  @Get('templates/:code')
  getTemplate(@Param('code') code: string) {
    return this.templates.adminGet(code);
  }

  @Patch('templates/:code')
  updateTemplate(
    @CurrentUser() user: AuthUser,
    @Param('code') code: string,
    @Body(new ZodPipe(updateTemplateBody)) body: z.infer<typeof updateTemplateBody>,
  ) {
    return this.templates.update(user.id, code, body);
  }

  /** Şablonun yeni sürümünü taslak olarak yükler. */
  @Post('templates/:code/versions')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  addVersion(
    @CurrentUser() user: AuthUser,
    @Param('code') code: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body(new ZodPipe(versionBody)) body: z.infer<typeof versionBody>,
  ) {
    if (!file) throw new BadRequestException('Dosya gerekli');
    return this.templates.addVersion(user.id, code, file.buffer, fileName(file), body.note);
  }

  @Post('templates/:code/versions/:versionId/publish')
  @HttpCode(200)
  publish(
    @CurrentUser() user: AuthUser,
    @Param('code') code: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Body(new ZodPipe(publishBody)) body: z.infer<typeof publishBody>,
  ) {
    return this.templates.publish(user.id, code, versionId, body.effectiveDate);
  }

  @Post('templates/:code/versions/:versionId/unpublish')
  @HttpCode(200)
  unpublish(
    @CurrentUser() user: AuthUser,
    @Param('code') code: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
  ) {
    return this.templates.unpublish(user.id, code, versionId);
  }

  @Delete('templates/:code/versions/:versionId')
  @HttpCode(204)
  async deleteDraft(
    @CurrentUser() user: AuthUser,
    @Param('code') code: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
  ) {
    await this.templates.deleteDraft(user.id, code, versionId);
  }

  @Get('templates/:code/versions/:versionId/file')
  async download(
    @Param('code') code: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Res() res: Response,
  ) {
    const version = await this.templates.file(code, versionId);
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
