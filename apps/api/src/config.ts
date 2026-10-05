import { Global, Module } from '@nestjs/common';
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET en az 32 karakter olmalı'),
  PORT: z.coerce.number().default(3000),
  CAPTCHA_SECRET: z.string().optional(),
  TRIAL_DAYS: z.coerce.number().int().positive().default(30),
});

export interface AppConfig {
  databaseUrl: string;
  jwtSecret: string;
  port: number;
  captchaSecret?: string;
  trialDays: number;
}

export const CONFIG = Symbol('CONFIG');

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const e = envSchema.parse(env);
  return {
    databaseUrl: e.DATABASE_URL,
    jwtSecret: e.JWT_SECRET,
    port: e.PORT,
    captchaSecret: e.CAPTCHA_SECRET || undefined,
    trialDays: e.TRIAL_DAYS,
  };
}

@Global()
@Module({
  providers: [{ provide: CONFIG, useFactory: () => loadConfig() }],
  exports: [CONFIG],
})
export class ConfigModule {}
