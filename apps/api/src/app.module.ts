import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { AuthGuard } from './common/auth.guard';
import { OrgGuard } from './common/org.guard';
import { AppConfig, CONFIG, ConfigModule } from './config';
import { DbModule } from './db/db.module';
import { DocumentsModule } from './documents/documents.module';
import { HealthController } from './health.controller';
import { InventoryModule } from './inventory/inventory.module';
import { MembersModule } from './members/members.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { RolesModule } from './roles/roles.module';
import { WorkflowModule } from './workflow/workflow.module';

@Module({
  imports: [
    ConfigModule,
    DbModule,
    JwtModule.registerAsync({
      global: true,
      inject: [CONFIG],
      useFactory: (config: AppConfig) => ({ secret: config.jwtSecret }),
    }),
    // Genel hız sınırı: IP başına dakikada 300 istek (DoS'a karşı ilk savunma hattı; asıl koruma WAF/CDN'de).
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 300 }],
      skipIf: () => process.env.NODE_ENV === 'test',
    }),
    AuditModule,
    AuthModule,
    OrganizationsModule,
    MembersModule,
    RolesModule,
    DocumentsModule,
    InventoryModule,
    WorkflowModule,
  ],
  controllers: [HealthController],
  providers: [
    // Sıra önemli: hız sınırı → kimlik doğrulama → kuruluş/yetki kontrolü.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: OrgGuard },
  ],
})
export class AppModule {}
