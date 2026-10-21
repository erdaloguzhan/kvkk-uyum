import { Controller, Get, INestApplication, Module, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { MailerService } from '../src/auth/mailer.service';
import { AppModule } from '../src/app.module';
import { AppConfig } from '../src/config';
import { Public } from '../src/common/request-context';
import { ALERT_INTERVAL_MS, ErrorAlertsService } from '../src/monitoring/error-alerts.service';
import { setupApp } from '../src/setup-app';
import { uniqueEmail } from './helpers';

const config = { platformAdminEmails: ['admin@ornek.com.tr'] } as unknown as AppConfig;

@Controller('deneme')
class FailingController {
  @Public()
  @Get('hata')
  fail() {
    throw new Error('veritabanı bağlantısı koptu');
  }

  @Public()
  @Get('bulunamadi')
  missing() {
    throw new NotFoundException('Kayıt bulunamadı');
  }
}

@Module({ controllers: [FailingController] })
class FailingModule {}

describe('Sistem uyarıları', () => {
  it('beklenmeyen hatada yöneticilere e-posta gider, istemci ayrıntıyı görmez', async () => {
    const admins = [uniqueEmail('yonetici'), uniqueEmail('yonetici')];
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL ??= process.env.TEST_DATABASE_URL ?? 'postgres://postgres@localhost:5433/kvkk_test';
    process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-123';
    process.env.PLATFORM_ADMIN_EMAILS = admins.join(',');
    try {
      const moduleRef = await Test.createTestingModule({ imports: [AppModule, FailingModule] }).compile();
      const app: INestApplication = moduleRef.createNestApplication();
      setupApp(app);
      await app.init();
      const server = app.getHttpServer();
      const alertsTo = () => app.get(MailerService).outbox.filter((m) => m.subject.includes('sunucu hatası'));

      await request(server).get('/api/v1/deneme/bulunamadi').expect(404);
      expect(alertsTo()).toHaveLength(0);

      const res = await request(server).get('/api/v1/deneme/hata').expect(500);
      expect(JSON.stringify(res.body)).not.toContain('veritabanı');
      await new Promise((r) => setTimeout(r, 50));
      expect(alertsTo().map((m) => m.to).sort()).toEqual([...admins].sort());
      expect(alertsTo()[0].text).toContain('GET /api/v1/deneme/hata');
      expect(alertsTo()[0].text).toContain('veritabanı bağlantısı koptu');
      app.get(ErrorAlertsService).onApplicationShutdown();
      await app.close();
    } finally {
      delete process.env.PLATFORM_ADMIN_EMAILS;
    }
  });

  it('15 dakika içindeki hatalar tek e-postada özetlenir', async () => {
    jest.useFakeTimers();
    try {
      const mailer = { outbox: [] as { to: string; subject: string; text: string }[], send: jest.fn(async (m) => void mailer.outbox.push(m)) };
      const alerts = new ErrorAlertsService(config, mailer as unknown as MailerService);
      (alerts as unknown as { logger: { error: () => void } }).logger = { error: () => undefined } as never;
      alerts.reportError('GET /a', new Error('bir'));
      alerts.reportError('GET /b', new Error('iki'));
      alerts.reportError('GET /c', new Error('üç'));
      expect(mailer.outbox).toHaveLength(1);
      jest.advanceTimersByTime(ALERT_INTERVAL_MS);
      await Promise.resolve();
      expect(mailer.outbox).toHaveLength(2);
      expect(mailer.outbox[1].subject).toContain('(2 yeni)');
      expect(mailer.outbox[1].text).toContain('üç');
      alerts.onApplicationShutdown();
    } finally {
      jest.useRealTimers();
    }
  });
});
