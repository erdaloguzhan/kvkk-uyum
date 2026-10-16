import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { passwordSchema } from '../common/password-policy';
import { AppRequest, clientInfo, Public } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { PortalAuthService, TraineeToken } from './portal-auth.service';
import { PortalService } from './portal.service';
import { AllowPendingPasswordChange, CurrentTrainee, TraineeGuard } from './trainee.guard';
import { answersBody } from './training.schema';

const loginBody = z.object({ email: z.email().max(254), password: z.string().min(1).max(128) });
const changePasswordBody = z.object({ currentPassword: z.string().min(1).max(128), newPassword: passwordSchema });
const resetRequestBody = z.object({ email: z.email().max(254) });
const resetConfirmBody = z.object({ token: z.string().min(1).max(200), password: passwordSchema });
const nextBody = z.object({ topicIndex: z.number().int().min(0) });

const AUTH_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

/** Eğitim Portalı (katılımcı). Kendi oturum belirteciyle çalışır; yönetim oturumu burada geçmez. */
@Controller('training-portal')
@Public()
export class TrainingPortalController {
  constructor(
    private readonly auth: PortalAuthService,
    private readonly portal: PortalService,
  ) {}

  @Throttle(AUTH_THROTTLE)
  @Post('login')
  @HttpCode(200)
  login(@Req() req: AppRequest, @Body(new ZodPipe(loginBody)) body: z.infer<typeof loginBody>) {
    return this.auth.login(body, clientInfo(req));
  }

  @Throttle(AUTH_THROTTLE)
  @Post('password-reset/request')
  @HttpCode(202)
  async requestReset(@Req() req: AppRequest, @Body(new ZodPipe(resetRequestBody)) body: z.infer<typeof resetRequestBody>) {
    await this.auth.requestReset(body.email, clientInfo(req));
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
