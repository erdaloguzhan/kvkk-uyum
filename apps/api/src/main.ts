import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { loadConfig } from './config';
import { setupApp } from './setup-app';

async function bootstrap() {
  const config = loadConfig();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  setupApp(app);
  await app.listen(config.port);
}

bootstrap();
