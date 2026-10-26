import { Body, Controller, Patch } from '@nestjs/common';
import { z } from 'zod';
import { AuthUser, CurrentUser } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { optionalMobile } from '../training/training.schema';
import { MembersService } from './members.service';

const phoneBody = z.object({ phone: optionalMobile });

/** Oturum açmış kullanıcının kendi profil bilgileri. */
@Controller('auth/me')
export class ProfileController {
  constructor(private readonly members: MembersService) {}

  /** Giriş doğrulama kodunun SMS ile gideceği cep telefonu. */
  @Patch('phone')
  setPhone(@CurrentUser() user: AuthUser, @Body(new ZodPipe(phoneBody)) body: z.infer<typeof phoneBody>) {
    return this.members.setPhone(user.id, user.id, body.phone);
  }
}
