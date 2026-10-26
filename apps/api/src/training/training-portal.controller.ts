import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { CaptchaService } from '../auth/captcha.service';
import { AppRequest, clientInfo, Public } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { sendFile } from './files';
import { PortalAuthService, TraineeToken } from './portal-auth.service';
import { PortalDocumentsService } from './portal-documents.service';
import { PortalService } from './portal.service';
import { CurrentTrainee, TraineeGuard } from './trainee.guard';
import { answersBody, mobileLogin } from './training.schema';

const codeBody = z.object({ phone: mobileLogin, captchaToken: z.string().max(2000).optional() });
const loginBody = z.object({ challengeId: z.uuid(), code: z.string().regex(/^\d{6}$/, 'Kod 6 haneli olmalı') });
const nextBody = z.object({ topicIndex: z.number().int().min(0) });
const readBody = z.object({ versionId: z.uuid() });

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const AUTH_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

/** Eğitim Portalı (katılımcı). Kendi oturum belirteciyle çalışır; yönetim oturumu burada geçmez. */
@Controller('training-portal')
@Public()
export class TrainingPortalController {
  constructor(
    private readonly auth: PortalAuthService,
    private readonly captcha: CaptchaService,
    private readonly portal: PortalService,
    private readonly documents: PortalDocumentsService,
  ) {}

  /** 1. adım: cep telefonuna SMS ile giriş kodu gönderilir. */
  @Throttle(AUTH_THROTTLE)
  @Post('login/code')
  @HttpCode(200)
  async requestCode(@Req() req: AppRequest, @Body(new ZodPipe(codeBody)) body: z.infer<typeof codeBody>) {
    const client = clientInfo(req);
    await this.captcha.verify(body.captchaToken, client.ip);
    return this.auth.requestCode(body.phone, client);
  }

  /** 2. adım: kod doğrulanır, portal oturumu açılır. */
  @Throttle(AUTH_THROTTLE)
  @Post('login')
  @HttpCode(200)
  login(@Req() req: AppRequest, @Body(new ZodPipe(loginBody)) body: z.infer<typeof loginBody>) {
    return this.auth.login(body, clientInfo(req));
  }

  @Get('me')
  @UseGuards(TraineeGuard)
  me(@CurrentTrainee() trainee: TraineeToken) {
    return { phone: trainee.sub };
  }

  @Get('assignments')
  @UseGuards(TraineeGuard)
  async assignments(@CurrentTrainee() trainee: TraineeToken) {
    return { items: await this.portal.assignments(trainee) };
  }

  /** Çalışanın kuruluşlarının yayınlanmış ve çalışanlara açık KVKK dokümanları. */
  @Get('documents')
  @UseGuards(TraineeGuard)
  async listDocuments(@CurrentTrainee() trainee: TraineeToken) {
    return { items: await this.documents.list(trainee) };
  }

  /** Dokümanı portalda okumak için (HTML) ve yayındaki sürüm için verilmiş okuma onayı. */
  @Get('documents/:id')
  @UseGuards(TraineeGuard)
  viewDocument(@CurrentTrainee() trainee: TraineeToken, @Param('id', ParseUUIDPipe) id: string) {
    return this.documents.view(trainee, id);
  }

  /** Dokümanın sonundaki "Okudum, anladım." onayı; okunan sürümle birlikte kaydedilir. */
  @Post('documents/:id/read')
  @HttpCode(200)
  @UseGuards(TraineeGuard)
  confirmRead(
    @Req() req: AppRequest,
    @CurrentTrainee() trainee: TraineeToken,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(readBody)) body: z.infer<typeof readBody>,
  ) {
    return this.documents.confirmRead(trainee, id, body.versionId, clientInfo(req));
  }

  @Get('documents/:id/file')
  @UseGuards(TraineeGuard)
  async documentFile(@CurrentTrainee() trainee: TraineeToken, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const file = await this.documents.file(trainee, id);
    sendFile(res, file.content, file.fileName, DOCX_MIME);
  }

  @Get('assignments/:id')
  @UseGuards(TraineeGuard)
  view(@CurrentTrainee() trainee: TraineeToken, @Param('id', ParseUUIDPipe) id: string) {
    return this.portal.view(trainee, id);
  }

  @Post('assignments/:id/next')
  @HttpCode(200)
  @UseGuards(TraineeGuard)
  next(
    @CurrentTrainee() trainee: TraineeToken,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(nextBody)) body: z.infer<typeof nextBody>,
  ) {
    return this.portal.next(trainee, id, body.topicIndex);
  }

  @Post('assignments/:id/pretest')
  @HttpCode(200)
  @UseGuards(TraineeGuard)
  pretest(
    @CurrentTrainee() trainee: TraineeToken,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(answersBody)) body: z.infer<typeof answersBody>,
  ) {
    return this.portal.submit(trainee, id, 'pre', body.answers);
  }

  @Post('assignments/:id/posttest')
  @HttpCode(200)
  @UseGuards(TraineeGuard)
  posttest(
    @CurrentTrainee() trainee: TraineeToken,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(answersBody)) body: z.infer<typeof answersBody>,
  ) {
    return this.portal.submit(trainee, id, 'post', body.answers);
  }
}
