import { Inject, Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { statfs } from 'node:fs/promises';
import { MailerService } from '../auth/mailer.service';
import { AppConfig, CONFIG } from '../config';

/** Aynı türden iki uyarı e-postası arasında en az bu kadar süre geçer; aradaki hatalar sayılıp sonrakine eklenir. */
export const ALERT_INTERVAL_MS = 15 * 60 * 1000;
/** Disk doluluğu bu oranı geçince uyarı verilir. */
const DISK_ALERT_RATIO = 0.85;
const DISK_CHECK_MS = 60 * 60 * 1000;

interface PendingAlert {
  lastSentAt: number;
  suppressed: number;
  /** Bekleme süresindeki son uyarının metni. */
  lastText?: string;
  timer?: NodeJS.Timeout;
}

/**
 * Sistem uyarıları: beklenmeyen sunucu hataları (500) ve dolmak üzere olan disk platform yöneticilerine
 * (`PLATFORM_ADMIN_EMAILS`) e-postayla bildirilir. Hata yağmurunda e-posta kutusu dolmasın diye her uyarı türü
 * en fazla 15 dakikada bir gönderilir; aradaki hatalar sayılır ve bir sonraki e-postada özetlenir.
 * Sistemin tamamen durması API'nin kendisi tarafından bildirilemez; onu dışarıdan çalışma durumu
 * kontrolü yakalar (docs/IZLEME.md).
 */
@Injectable()
export class ErrorAlertsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(ErrorAlertsService.name);
  private readonly pending = new Map<string, PendingAlert>();
  private diskTimer?: NodeJS.Timeout;

  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly mailer: MailerService,
  ) {}

  onApplicationBootstrap() {
    if (process.env.NODE_ENV === 'test') return;
    const tick = () => this.checkDisk().catch((err) => this.logger.warn(`Disk kontrolü yapılamadı: ${err}`));
    this.diskTimer = setInterval(tick, DISK_CHECK_MS);
    this.diskTimer.unref();
    void tick();
  }

  onApplicationShutdown() {
    if (this.diskTimer) clearInterval(this.diskTimer);
    for (const p of this.pending.values()) if (p.timer) clearTimeout(p.timer);
  }

  /** Beklenmeyen hata. `where`: isteğin yöntemi ve yolu ya da arka plan işinin adı. */
  reportError(where: string, err: unknown) {
    const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    this.alert(
      'error',
      'KVK Yönetim Sistemi: sunucu hatası',
      `Sunucuda beklenmeyen bir hata oluştu.\n\nYer: ${where}\nHata: ${message}\nZaman: ${new Date().toISOString()}\n\n` +
        'Ayrıntı için sunucuda: docker compose -f docker-compose.prod.yml logs --since 1h api',
    );
  }

  async checkDisk(path = '/') {
    const s = await statfs(path);
    const used = 1 - s.bavail / s.blocks;
    if (used < DISK_ALERT_RATIO) return;
    const freeGb = ((s.bavail * s.bsize) / 1024 ** 3).toFixed(1);
    this.alert(
      'disk',
      'KVK Yönetim Sistemi: disk dolmak üzere',
      `Sunucu diskinin %${Math.round(used * 100)}'i dolu, ${freeGb} GB boş yer kaldı.\n` +
        'Disk dolarsa veritabanı yazamaz ve sistem durur. Eski yedekleri ve Docker imajlarını temizleyin ' +
        '(docker system prune) veya diski büyütün.',
    );
  }

  private alert(kind: string, subject: string, text: string, now = Date.now()) {
    const p = this.pending.get(kind) ?? { lastSentAt: 0, suppressed: 0 };
    this.pending.set(kind, p);
    if (now - p.lastSentAt >= ALERT_INTERVAL_MS && !p.timer) {
      p.lastSentAt = now;
      void this.send(subject, text);
      return;
    }
    // Bekleme süresinde gelenler sayılır; süre dolunca tek e-postada bildirilir.
    p.suppressed++;
    p.lastText = text;
    p.timer ??= setTimeout(() => {
      p.timer = undefined;
      p.lastSentAt = Date.now();
      const count = p.suppressed;
      p.suppressed = 0;
      void this.send(`${subject} (${count} yeni)`, `Son uyarıdan bu yana ${count} kez daha oluştu. Sonuncusu:\n\n${p.lastText}`);
    }, Math.max(0, p.lastSentAt + ALERT_INTERVAL_MS - now));
    p.timer.unref?.();
  }

  private async send(subject: string, text: string) {
    this.logger.error(`${subject}\n${text}`);
    for (const to of this.config.platformAdminEmails) {
      await this.mailer.send({ to, subject, text }).catch((err) => this.logger.error(`Uyarı e-postası gönderilemedi (${to}): ${err}`));
    }
  }
}
