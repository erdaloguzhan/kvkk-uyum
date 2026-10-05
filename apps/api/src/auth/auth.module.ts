import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CaptchaService } from './captcha.service';
import { MailerService } from './mailer.service';
import { PasswordResetService } from './password-reset.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService, CaptchaService, MailerService, PasswordResetService],
  exports: [MailerService, PasswordResetService],
})
export class AuthModule {}
