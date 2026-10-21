import { Body, Controller, Get, HttpCode, Logger, Param, ParseUUIDPipe, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { CaptchaService } from '../auth/captcha.service';
import { passwordSchema } from '../common/password-policy';
import { AppRequest, clientInfo, Public } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { sendFile } from './files';
import { PortalAuthService, TraineeToken } from './portal-auth.service';
import { PortalDocumentsService } from './portal-documents.service';
import { PortalService } from './portal.service';
import { AllowPendingPasswordChange, CurrentTrainee, TraineeGuard } from './trainee.guard';
import { answersBody } from './training.schema';

const loginBody = z.object({ email: z.email().max(254), password: z.string().min(1).max(128), captchaToken: z.string().max(2000).optional() });
const changePasswordBody = z.object({ currentPassword: z.string().min(1).max(128), newPassword: passwordSchema });
const resetRequestBody = z.object({ email: z.email().max(254), captchaToken: z.string().max(2000).optional() });
const resetConfirmBody = z.object({ token: z.string().min(1).max(200), password: passwordSchema });
const nextBody = z.object({ topicIndex: z.number().int().min(0) });
const readBody = z.object({ versionId: z.uuid() });

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const AUTH_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

/** Eğitim Portalı (katılımcı). Kendi oturum belirteciyle çalışır; yönetim oturumu burada geçmez. */
@Controller('training-portal')
@Public()
export class TrainingPortalController {
  private readonly logger = new Logger(TrainingPortalController.name);

  constructor(
    private readonly auth: PortalAuthService,
    private readonly captcha: CaptchaService,
    private readonly portal: PortalService,
    private readonly documents: PortalDocumentsService,
  ) {}

  @Throttle(AUTH_THROTTLE)
  @Post('login')
  @HttpCode(200)
  async login(@Req() req: AppRequest, @Body(new ZodPipe(loginBody)) body: z.infer<typeof loginBody>) {
    const client = clientInfo(req);
    await this.captcha.verify(body.captchaToken, client.ip);
    return this.auth.login(body, client);
  }

  @Throttle(AUTH_THROTTLE)
  @Post('password-reset/request')
  @HttpCode(202)
  async requestReset(@Req() req: AppRequest, @Body(new ZodPipe(resetRequestBody)) body: z.infer<typeof resetRequestBody>) {
    await this.captcha.verify(body.captchaToken, req.ip ?? null);
    // Yanıt e-postayı beklemez; yanıt süresinden adresin kayıtlı olup olmadığı anlaşılamaz.
    void this.auth.requestReset(body.email, clientInfo(req)).catch((err) => this.logger.error(`Portal şifre sıfırlama e-postası gönderilemedi: ${err}`));
  }

  @Throttle(AUTH_THROTTLE)
  @Post('password-reset/confirm')
  @HttpCode(204)
  async confirmReset(@Req() req: AppRequest, @Body(new ZodPipe(resetConfirmBody)) body: z.infer<typeof resetConfirmBody>) {
    await this.auth.confirmReset(body.token, body.password, clientInfo(req));
  }

  @Throttle(AUTH_THROTTLE)
  @Post('change-password')
  @HttpCode(200)
  @UseGuards(TraineeGuard)
  @AllowPendingPasswordChange()
  changePassword(
    @Req() req: AppRequest,
    @CurrentTrainee() trainee: TraineeToken,
    @Body(new ZodPipe(changePasswordBody)) body: z.infer<typeof changePasswordBody>,
  ) {
    return this.auth.changePassword(trainee, body, clientInfo(req));
  }

  @Get('me')
  @UseGuards(TraineeGuard)
  @AllowPendingPasswordChange()
  async me(@CurrentTrainee() trainee: TraineeToken) {
    const account = await this.auth.findById(trainee.sub);
    return { email: account.email, mustChangePassword: account.mustChangePassword };
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
