import { INestApplication } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';

/** Uygulama ve testler için ortak HTTP ayarları. */
export function setupApp(app: INestApplication) {
  const express = app as NestExpressApplication;
  // Yük dengeleyici arkasında gerçek istemci IP'si için.
  express.set('trust proxy', 1);
  express.use(helmet());
  express.enableCors({ origin: process.env.CORS_ORIGINS?.split(',') ?? false });
  express.setGlobalPrefix('api/v1');
  express.enableShutdownHooks();
}
