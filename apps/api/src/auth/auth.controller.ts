import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { passwordSchema } from '../common/password-policy';
import { AppRequest, AuthUser, clientInfo, CurrentUser, Public } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { AuthService } from './auth.service';
import { CaptchaService } from './captcha.service';
import { PasswordResetService } from './password-reset.service';

const registerBody = z.object({
  email: z.email().max(254),
  password: passwordSchema,
  fullName: z.string().trim().min(2).max(200),
  captchaToken: z.string().optional(),
});
const loginBody = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(128),
  captchaToken: z.string().optional(),
});
const verifyBody = z.object({ challengeId: z.uuid(), code: z.string().regex(/^\d{6}$/) });
const refreshBody = z.object({ refreshToken: z.string().min(1).max(200) });
const resetRequestBody = z.object({ email: z.email().max(254), captchaToken: z.string().optional() });
const resetConfirmBody = z.object({ token: z.string().min(1).max(200), password: passwordSchema });

// Kimlik doğrulama uç noktaları için sıkı hız sınırı: dakikada 10 istek.
const AUTH_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly captcha: CaptchaService,
    private readonly passwordReset: PasswordResetService,
  ) {}

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('register')
  async register(@Req() req: AppRequest, @Body(new ZodPipe(registerBody)) body: z.infer<typeof registerBody>) {
    const client = clientInfo(req);
    await this.captcha.verify(body.captchaToken, client.ip);
    return this.auth.register(body, client);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('login')
  @HttpCode(200)
  async login(@Req() req: AppRequest, @Body(new ZodPipe(loginBody)) body: z.infer<typeof loginBody>) {
    const client = clientInfo(req);
    await this.captcha.verify(body.captchaToken, client.ip);
    return this.auth.login(body, client);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('verify')
  @HttpCode(200)
  verify(@Req() req: AppRequest, @Body(new ZodPipe(verifyBody)) body: z.infer<typeof verifyBody>) {
    return this.auth.verifyCode(body, clientInfo(req));
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body(new ZodPipe(refreshBody)) body: z.infer<typeof refreshBody>) {
    return this.auth.refresh(body.refreshToken);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('password-reset/request')
  @HttpCode(202)
  async requestReset(
    @Req() req: AppRequest,
    @Body(new ZodPipe(resetRequestBody)) body: z.infer<typeof resetRequestBody>,
  ) {
    const client = clientInfo(req);
    await this.captcha.verify(body.captchaToken, client.ip);
    await this.passwordReset.request(body.email, client);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('password-reset/confirm')
  @HttpCode(204)
  async confirmReset(
    @Req() req: AppRequest,
    @Body(new ZodPipe(resetConfirmBody)) body: z.infer<typeof resetConfirmBody>,
  ) {
    await this.passwordReset.confirm(body.token, body.password, clientInfo(req));
  }

  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() req: AppRequest,
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(refreshBody)) body: z.infer<typeof refreshBody>,
  ) {
    await this.auth.logout(body.refreshToken, user.id, clientInfo(req));
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }
}
