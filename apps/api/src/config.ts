import { Global, Module } from '@nestjs/common';
import path from 'node:path';
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET en az 32 karakter olmalı'),
  // T.C. kimlik no gibi alanların şifreleme anahtarı; common/field-crypto bunu doğrudan ortamdan okur.
  DATA_ENCRYPTION_KEY: z.string().refine(
    (v) => Buffer.from(v, 'base64').length === 32,
    'DATA_ENCRYPTION_KEY 32 baytlık base64 bir değer olmalı (openssl rand -base64 32)',
  ),
  PORT: z.coerce.number().default(3000),
  CAPTCHA_SECRET: z.string().optional(),
  TRIAL_DAYS: z.coerce.number().int().positive().default(30),
  CONTENT_DIR: z.string().optional(),
  ALARM_INTERVAL_MINUTES: z.coerce.number().int().min(0).default(60),
  SMTP_URL: z.string().optional(),
  MAIL_FROM: z.string().default('KVK Yönetim Sistemi <no-reply@localhost>'),
  APP_URL: z.string().default('http://localhost:3000'),
  PLATFORM_ADMIN_EMAILS: z.string().optional(),
  VERIMOR_USERNAME: z.string().optional(),
  VERIMOR_PASSWORD: z.string().optional(),
  SMS_HEADER: z.string().default('KVK UYUM'),
});

export interface AppConfig {
  databaseUrl: string;
  jwtSecret: string;
  port: number;
  captchaSecret?: string;
  trialDays: number;
  /** Doküman şablonlarının bulunduğu klasör (depodaki content/). */
  contentDir: string;
  /** Hatırlatma ve gecikme alarmlarının kaç dakikada bir taranacağı (0: kapalı). */
  alarmIntervalMinutes: number;
  /** SMTP bağlantısı (ör. smtp://kullanici:sifre@sunucu:587). Boşsa e-postalar yalnızca loglanır. */
  smtpUrl?: string;
  mailFrom: string;
  /** Web arayüzünün adresi; e-postalardaki bağlantılar bunu kullanır. */
  appUrl: string;
  /** Açılışta platform yöneticisi yapılacak e-posta adresleri (yoksa hesap açılıp davet gönderilir). */
  platformAdminEmails: string[];
  /** Verimor SMS hesabı (kullanıcı adı 90850... biçiminde, API şifresi). Yoksa SMS'ler yalnızca loglanır. */
  verimor?: { username: string; password: string };
  /** SMS başlığı (gönderici adı); Verimor'da kayıtlı olmalı. */
  smsHeader: string;
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
    contentDir: e.CONTENT_DIR || path.resolve(__dirname, '../../../content'),
    alarmIntervalMinutes: e.ALARM_INTERVAL_MINUTES,
    smtpUrl: e.SMTP_URL || undefined,
    mailFrom: e.MAIL_FROM,
    appUrl: e.APP_URL.replace(/\/+$/, ''),
    platformAdminEmails: (e.PLATFORM_ADMIN_EMAILS ?? '')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean),
    verimor: e.VERIMOR_USERNAME && e.VERIMOR_PASSWORD ? { username: e.VERIMOR_USERNAME, password: e.VERIMOR_PASSWORD } : undefined,
    smsHeader: e.SMS_HEADER,
  };
}

@Global()
@Module({
  providers: [{ provide: CONFIG, useFactory: () => loadConfig() }],
  exports: [CONFIG],
})
export class ConfigModule {}
