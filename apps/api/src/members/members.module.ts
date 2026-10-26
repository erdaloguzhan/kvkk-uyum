import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MembersController } from './members.controller';
import { MembersService } from './members.service';
import { ProfileController } from './profile.controller';

@Module({
  imports: [AuthModule],
  controllers: [MembersController, ProfileController],
  providers: [MembersService],
  exports: [MembersService],
})
export class MembersModule {}
