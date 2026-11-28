import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import {
  DEFAULT_TIME_ZONE,
  DOCUMENT_TEMPLATES,
  DocumentCategory,
  ORGANIZATION_PLACEHOLDERS,
} from '@kvkk/shared';
import { and, asc, desc, eq, getTableColumns, inArray, lte, ne } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { AuditService } from '../audit/audit.service';
import { AppConfig, CONFIG } from '../config';
import { Database, InjectDb } from '../db/db.module';
import { documentTemplates, templateVersions } from '../db/schema';
import { isDocx, templateTags, UNSUPPORTED_PLACEHOLDERS } from '../documents/template-renderer';
import { dateIn } from '../workflow/dates';

/** Sürüm bilgisi (dosya içeriği hariç). */
const { content: _content, ...versionColumns } = getTableColumns(templateVersions);

type VersionRow = Omit<typeof templateVersions.$inferSelect, 'content'>;

/** Sürümün ana şablon ekranında gösterilen durumu. */
export type TemplateVersionState = 'draft' | 'current' | 'scheduled' | 'past';

/**
 * content/ klasöründe içeriği değiştirilen katalog şablonları. Açılışta, şablonun son sürümü hâlâ eski
 * dosyaysa (yönetici arada başka bir sürüm yüklememişse) yeni dosya bir sonraki sürüm olarak hemen yayına
 * alınır. Kuruluşlar mevcut dokümanlarında "Yeni şablonla güncelle" uyarısını görür; dokümanları kendiliğinden
 * değişmez. Yeni dosya zaten bir sürüm olarak varsa hiçbir şey yapılmaz.
 */
export const TEMPLATE_CONTENT_UPDATES: { code: string; previousSha256: string; note: string }[] = [
  {
    code: 'AYM-010',
    previousSha256: 'ecf773c07ce00874001bcce4a5fb7918184f72e3bf022091abdb53ab0034738b',
    note: 'KVKK mevzuat incelemesi sonrası güncel metin (2026-11-28)',
  },
  {
    code: 'AYM-020',
    previousSha256: 'c01e70fe7ad2084d1b3518f9b453f17283fbd950f7afa3b5ca5cd1cb941414ac',
    note: 'KVKK mevzuat incelemesi sonrası güncel metin (2026-11-28)',
  },
  {
    code: 'AYM-030',
    previousSha256: 'fcf8b3a3db350bb1080b702aa936cd021c06d0861d72697f97cac648a95d6f51',
    note: 'KVKK mevzuat incelemesi sonrası güncel metin (2026-11-28)',
  },
  {
    code: 'AYM-040',
    previousSha256: '2650f70950c699a1562924fe6ab6ba3936cd7036b69a5b418c8cddc15d7235ab',
    note: 'KVKK mevzuat incelemesi sonrası güncel metin (2026-11-28)',
  },
  {
    code: 'AYM-041',
    previousSha256: '8c811bb66804dd64701e027c046ef893dbb8416d47228992f1df687b17921a55',
    note: 'KVKK mevzuat incelemesi sonrası güncel metin (2026-11-28)',
  },
  {
    code: 'AYM-050',
    previousSha256: '791f9b5dcefdb5b823fc6a80ffaa96173994aebe7c5819b7910a89cf1cd3c16f',
    note: 'KVKK mevzuat incelemesi sonrası güncel metin (2026-11-28)',
  },
  {
    code: 'FRM-010',
    previousSha256: 'b611cf9248b5d408ebe2106f44c9a524fb667c1a3b0072a3beb1899b7ce569a1',
    note: 'KVKK mevzuat incelemesi sonrası güncel metin (2026-11-28)',
  },
  {
    code: 'FRM-020',
    previousSha256: 'a5e7fa4ffaf62706a98a341e144efa2c3e4fd87ce93796e8ef906e2df4aec387',
    note: 'KVKK mevzuat incelemesi sonrası güncel metin (2026-11-28)',
  },
  {
    code: 'POL-010',
    previousSha256: '59d6c8ddc4454e9957e618b80a1515fefe0555e47beec68f61aeea5a5a904349',
    note: 'KVKK mevzuat incelemesi sonrası güncel metin (2026-11-28)',
  },
  {
    code: 'POL-020',
    previousSha256: 'cb53768bb3c23f3e9919296186a0367419afae253fb1238f2e9a11ebcfb77eeb',
    note: 'KVKK mevzuat incelemesi sonrası güncel metin (2026-11-28)',
  },
  {
    code: 'PRS-010',
    previousSha256: '0f8d5aaf01ebd6536df4ef71167796df83625c665e28c9b437b661079ccce837',
    note: 'KVKK mevzuat incelemesi sonrası güncel metin (2026-11-28)',
  },
  {
    code: 'PRS-020',
    previousSha256: 'ed5f9e1d500d1c7d0338322c8c3f2a0978199c3c562cf8e4850ac350cd88d1a4',
    note: 'KVKK mevzuat incelemesi sonrası güncel metin (2026-11-28)',
  },
  {
    code: 'PRS-030',
    previousSha256: '3e08d2ff71c14e4a48d19212e47ec3aeae249b5b8a7bd01c6d0f5411da7cd514',
    note: 'KVKK mevzuat incelemesi sonrası güncel metin (2026-11-28)',
  },
  {
    code: 'SZL-010',
    previousSha256: '5dfe55d9fac3a3b51a033d825c4612c619349d784e18c243a5cfa4f837381d1e',
    note: 'KVKK mevzuat incelemesi sonrası güncel metin (2026-11-28)',
  },
  {
    code: 'SZL-020',
    previousSha256: '8b46e4f8832bb3d5c34fdbff095eef71dc0040b211d3eac704b8681c42c3dc34',
    note: 'KVKK mevzuat incelemesi sonrası güncel metin (2026-11-28)',
  },
];

const ALLOWED_PLACEHOLDERS = [...Object.keys(ORGANIZATION_PLACEHOLDERS), ...UNSUPPORTED_PLACEHOLDERS];

export interface TemplateMeta {
  title: string;
  category: DocumentCategory;
  optional: boolean;
}

/**
 * Ana (master) doküman şablonları. Platform yöneticisi yeni sürüm yükler ve bir yayın tarihiyle yayınlar;
 * kuruluşlar o tarihten itibaren yeni dokümanlarını bu sürümden üretir. Kuruluşların daha önce ürettiği
 * dokümanlar kendiliğinden değişmez.
 */
@Injectable()
export class TemplatesService implements OnModuleInit {
  private readonly logger = new Logger(TemplatesService.name);

  constructor(
    @InjectDb() private readonly db: Database,
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly audit: AuditService,
  ) {}

  async onModuleInit() {
    await this.syncCatalog();
  }

  /**
   * Veritabanında olmayan katalog şablonlarını (DOCUMENT_TEMPLATES) content/ klasöründeki dosyayla
   * ilk sürüm olarak yayında ekler. Var olan şablonlara dokunmaz; birden çok sunucu aynı anda çalışabilir.
   */
  async syncCatalog() {
    const existing = await this.db.select({ code: templateVersions.templateCode }).from(templateVersions);
    const withVersion = new Set(existing.map((r) => r.code));
    for (const t of DOCUMENT_TEMPLATES) {
      await this.db
        .insert(documentTemplates)
        .values({ code: t.code, title: t.title, category: t.category, optional: t.optional })
        .onConflictDoNothing();
      if (withVersion.has(t.code)) continue;
      let content: Buffer;
      try {
        content = await readFile(path.join(this.config.contentDir, t.file));
      } catch {
        this.logger.warn(`${t.code} şablon dosyası bulunamadı: ${t.file}`);
        continue;
      }
      const now = new Date();
      await this.db
        .insert(templateVersions)
        .values({
          templateCode: t.code,
          versionNo: 1,
          status: 'published',
          fileName: path.basename(t.file),
          content,
          sizeBytes: content.length,
          sha256: sha256(content),
          note: 'İlk sürüm',
          effectiveFrom: now,
          publishedAt: now,
        })
        .onConflictDoNothing();
    }
    await this.applyContentUpdates();
  }

  /** TEMPLATE_CONTENT_UPDATES içindeki şablonların yeni dosyasını sürüm olarak yayınlar. */
  async applyContentUpdates(updates = TEMPLATE_CONTENT_UPDATES, contentDir = this.config.contentDir) {
    for (const u of updates) {
      const t = DOCUMENT_TEMPLATES.find((x) => x.code === u.code);
      if (!t) continue;
      let content: Buffer;
      try {
        content = await readFile(path.join(contentDir, t.file));
      } catch {
        continue;
      }
      const hash = sha256(content);
      const versions = await this.db
        .select({ versionNo: templateVersions.versionNo, sha256: templateVersions.sha256 })
        .from(templateVersions)
        .where(eq(templateVersions.templateCode, u.code))
        .orderBy(desc(templateVersions.versionNo));
      if (versions.length === 0 || versions.some((v) => v.sha256 === hash)) continue;
      if (versions[0].sha256 !== u.previousSha256) {
        this.logger.warn(`${u.code}: son sürüm eski şablon dosyası değil; yeni dosya otomatik yayınlanmadı`);
        continue;
      }
      const now = new Date();
      const inserted = await this.db
        .insert(templateVersions)
        .values({
          templateCode: u.code,
          versionNo: versions[0].versionNo + 1,
          status: 'published',
          fileName: path.basename(t.file),
          content,
          sizeBytes: content.length,
          sha256: hash,
          note: u.note,
          effectiveFrom: now,
          publishedAt: now,
        })
        .onConflictDoNothing()
        .returning({ id: templateVersions.id, versionNo: templateVersions.versionNo });
      if (inserted[0]) {
        this.logger.log(`${u.code} v${inserted[0].versionNo} yayınlandı: ${u.note}`);
        await this.db.update(documentTemplates).set({ updatedAt: now }).where(eq(documentTemplates.code, u.code));
        await this.audit.record({
          action: 'template.published',
          entityType: 'document_template',
          entityId: u.code,
          metadata: {
            versionId: inserted[0].id,
            versionNo: inserted[0].versionNo,
            effectiveFrom: now.toISOString(),
            source: 'content',
          },
        });
      }
    }
  }

  /** Şablon başına şu an geçerli (yayın tarihi gelmiş en son) sürüm. */
  async effectiveVersions(now = new Date()) {
    const rows = await this.db
      .selectDistinctOn([templateVersions.templateCode], {
        id: templateVersions.id,
        templateCode: templateVersions.templateCode,
        versionNo: templateVersions.versionNo,
        effectiveFrom: templateVersions.effectiveFrom,
      })
      .from(templateVersions)
      .where(and(eq(templateVersions.status, 'published'), lte(templateVersions.effectiveFrom, now)))
      .orderBy(templateVersions.templateCode, desc(templateVersions.effectiveFrom), desc(templateVersions.versionNo));
    return new Map(rows.map((r) => [r.templateCode, r]));
  }

  /** Kuruluşların kullanabileceği şablonlar: geçerli sürümü olanlar. */
  async catalog() {
    const [templates, effective] = await Promise.all([
      this.db.select().from(documentTemplates).orderBy(asc(documentTemplates.code)),
      this.effectiveVersions(),
    ]);
    return templates
      .filter((t) => effective.has(t.code))
      .map((t) => ({ ...t, effectiveVersion: effective.get(t.code)! }));
  }

  /** Şablonun şu an geçerli sürümü, dosya içeriğiyle. */
  async effective(code: string) {
    const [template] = await this.db.select().from(documentTemplates).where(eq(documentTemplates.code, code));
    if (!template) throw new NotFoundException('Şablon bulunamadı');
    const current = (await this.effectiveVersions()).get(code);
    if (!current) throw new NotFoundException('Şablonun yayında sürümü yok');
    const [version] = await this.db
      .select({ id: templateVersions.id, versionNo: templateVersions.versionNo, content: templateVersions.content })
      .from(templateVersions)
      .where(eq(templateVersions.id, current.id));
    return { template, version };
  }

  /** Verilen sürümlerin numaraları (doküman hangi şablon sürümüne dayanıyor). */
  async versionNumbers(ids: string[]) {
    if (ids.length === 0) return new Map<string, number>();
    const rows = await this.db
      .select({ id: templateVersions.id, versionNo: templateVersions.versionNo })
      .from(templateVersions)
      .where(inArray(templateVersions.id, ids));
    return new Map(rows.map((r) => [r.id, r.versionNo]));
  }

  // ---- Platform yöneticisi işlemleri ----

  async adminList() {
    const now = new Date();
    const [templates, versions] = await Promise.all([
      this.db.select().from(documentTemplates).orderBy(asc(documentTemplates.code)),
      this.db.select(versionColumns).from(templateVersions).orderBy(desc(templateVersions.versionNo)),
    ]);
    return templates.map((t) => {
      const own = withStates(
        versions.filter((v) => v.templateCode === t.code),
        now,
      );
      return {
        ...t,
        currentVersion: own.find((v) => v.state === 'current') ?? null,
        scheduledVersions: own.filter((v) => v.state === 'scheduled'),
        draftCount: own.filter((v) => v.state === 'draft').length,
        latestVersionNo: own[0]?.versionNo ?? 0,
      };
    });
  }

  async adminGet(code: string) {
    const template = await this.findTemplate(code);
    const versions = await this.db
      .select(versionColumns)
      .from(templateVersions)
      .where(eq(templateVersions.templateCode, code))
      .orderBy(desc(templateVersions.versionNo));
    return { ...template, versions: withStates(versions, new Date()) };
  }

  /** Yeni ana şablon ekler; dosyası ilk taslak sürüm olur, yayınlanınca kuruluşlara açılır. */
  async create(userId: string, code: string, meta: TemplateMeta, file: Buffer, fileName: string, note?: string | null) {
    this.validateFile(file);
    const result = await this.db.transaction(async (tx) => {
      const [exists] = await tx
        .select({ code: documentTemplates.code })
        .from(documentTemplates)
        .where(eq(documentTemplates.code, code));
      if (exists) throw new ConflictException('Bu kodla bir şablon zaten var');
      await tx.insert(documentTemplates).values({ code, ...meta });
      const [version] = await tx
        .insert(templateVersions)
        .values(newVersion(code, 1, userId, file, fileName, note))
        .returning(versionColumns);
      return version;
    });
    await this.audit.record({
      action: 'template.created',
      userId,
      entityType: 'document_template',
      entityId: code,
      metadata: { versionId: result.id },
    });
    return this.adminGet(code);
  }

  async update(userId: string, code: string, changes: Partial<Pick<TemplateMeta, 'title' | 'optional'>>) {
    await this.findTemplate(code);
    await this.db
      .update(documentTemplates)
      .set({ ...changes, updatedAt: new Date() })
      .where(eq(documentTemplates.code, code));
    await this.audit.record({
      action: 'template.updated',
      userId,
      entityType: 'document_template',
      entityId: code,
      metadata: { fields: Object.keys(changes) },
    });
    return this.adminGet(code);
  }

  /** Yeni sürümü taslak olarak ekler; yayınlanana kadar kuruluşları etkilemez. */
  async addVersion(userId: string, code: string, file: Buffer, fileName: string, note?: string | null) {
    this.validateFile(file);
    const version = await this.db.transaction(async (tx) => {
      // Sürüm numarası çakışmasın diye şablon satırı kilitlenir.
      const [template] = await tx
        .select({ code: documentTemplates.code })
        .from(documentTemplates)
        .where(eq(documentTemplates.code, code))
        .for('update');
      if (!template) throw new NotFoundException('Şablon bulunamadı');
      const [last] = await tx
        .select({ versionNo: templateVersions.versionNo })
        .from(templateVersions)
        .where(eq(templateVersions.templateCode, code))
        .orderBy(desc(templateVersions.versionNo))
        .limit(1);
      const [v] = await tx
        .insert(templateVersions)
        .values(newVersion(code, (last?.versionNo ?? 0) + 1, userId, file, fileName, note))
        .returning(versionColumns);
      return v;
    });
    await this.audit.record({
      action: 'template.version_added',
      userId,
      entityType: 'document_template',
      entityId: code,
      metadata: { versionId: version.id, versionNo: version.versionNo },
    });
    return version;
  }

  /**
   * Taslak sürümü yayınlar. `effectiveDate` (YYYY-MM-DD, Türkiye saati) verilmezse veya bugünse hemen,
   * ileri bir tarihse o günün başından itibaren geçerli olur.
   */
  async publish(userId: string, code: string, versionId: string, effectiveDate?: string | null) {
    const now = new Date();
    const today = dateIn(now, DEFAULT_TIME_ZONE);
    if (effectiveDate && effectiveDate < today) {
      throw new BadRequestException('Yayın tarihi bugünden önce olamaz');
    }
    // Türkiye 2016'dan beri yaz saati uygulamıyor (UTC+3).
    const effectiveFrom = !effectiveDate || effectiveDate === today ? now : new Date(`${effectiveDate}T00:00:00+03:00`);

    const version = await this.db.transaction(async (tx) => {
      await tx
        .select({ code: documentTemplates.code })
        .from(documentTemplates)
        .where(eq(documentTemplates.code, code))
        .for('update');
      const [v] = await tx
        .select(versionColumns)
        .from(templateVersions)
        .where(and(eq(templateVersions.id, versionId), eq(templateVersions.templateCode, code)));
      if (!v) throw new NotFoundException('Sürüm bulunamadı');
      if (v.status !== 'draft') throw new ConflictException('Yalnızca taslak sürüm yayınlanabilir');
      const [latest] = await tx
        .select({ effectiveFrom: templateVersions.effectiveFrom, versionNo: templateVersions.versionNo })
        .from(templateVersions)
        .where(and(eq(templateVersions.templateCode, code), eq(templateVersions.status, 'published')))
        .orderBy(desc(templateVersions.effectiveFrom))
        .limit(1);
      if (latest?.effectiveFrom && latest.effectiveFrom > effectiveFrom) {
        throw new ConflictException(
          `v${latest.versionNo} daha ileri bir tarihte yayına alınacak; bu sürümün yayın tarihi ondan önce olamaz`,
        );
      }
      const [updated] = await tx
        .update(templateVersions)
        .set({ status: 'published', effectiveFrom, publishedAt: now, publishedBy: userId })
        .where(eq(templateVersions.id, v.id))
        .returning(versionColumns);
      await tx.update(documentTemplates).set({ updatedAt: now }).where(eq(documentTemplates.code, code));
      return updated;
    });
    await this.audit.record({
      action: 'template.published',
      userId,
      entityType: 'document_template',
      entityId: code,
      metadata: { versionId, versionNo: version.versionNo, effectiveFrom: effectiveFrom.toISOString() },
    });
    return this.adminGet(code);
  }

  /** Yayın tarihi henüz gelmemiş sürümün yayınını iptal eder (sürüm taslağa döner). */
  async unpublish(userId: string, code: string, versionId: string) {
    const v = await this.findVersion(code, versionId);
    if (v.status !== 'published' || !v.effectiveFrom || v.effectiveFrom <= new Date()) {
      throw new ConflictException('Yalnızca yayın tarihi gelmemiş sürümün yayını iptal edilebilir');
    }
    await this.db
      .update(templateVersions)
      .set({ status: 'draft', effectiveFrom: null, publishedAt: null, publishedBy: null })
      .where(eq(templateVersions.id, v.id));
    await this.audit.record({
      action: 'template.unpublished',
      userId,
      entityType: 'document_template',
      entityId: code,
      metadata: { versionId, versionNo: v.versionNo },
    });
    return this.adminGet(code);
  }

  async deleteDraft(userId: string, code: string, versionId: string) {
    const v = await this.findVersion(code, versionId);
    if (v.status !== 'draft') throw new ConflictException('Yalnızca taslak sürüm silinebilir');
    await this.db
      .delete(templateVersions)
      .where(and(eq(templateVersions.id, v.id), ne(templateVersions.status, 'published')));
    await this.audit.record({
      action: 'template.draft_deleted',
      userId,
      entityType: 'document_template',
      entityId: code,
      metadata: { versionId, versionNo: v.versionNo },
    });
  }

  async file(code: string, versionId: string) {
    const [v] = await this.db
      .select({ fileName: templateVersions.fileName, content: templateVersions.content })
      .from(templateVersions)
      .where(and(eq(templateVersions.id, versionId), eq(templateVersions.templateCode, code)));
    if (!v) throw new NotFoundException('Sürüm bulunamadı');
    return v;
  }

  /** Dosya açılabilir bir Word dokümanı olmalı ve yalnızca tanınan yer tutucuları içermeli. */
  private validateFile(file: Buffer) {
    if (!isDocx(file)) throw new BadRequestException('Dosya geçerli bir Word (.docx) dokümanı değil');
    let tags: string[];
    try {
      tags = templateTags(file);
    } catch {
      throw new BadRequestException(
        'Şablondaki yer tutucular okunamadı. Her alanın {{ ile başlayıp }} ile bittiğini kontrol edin.',
      );
    }
    const unknown = tags.filter((t) => !ALLOWED_PLACEHOLDERS.includes(t));
    if (unknown.length > 0) {
      throw new BadRequestException(
        `Şablonda tanınmayan alan var: ${unknown.map((t) => `{{${t}}}`).join(', ')}. ` +
          `Kullanılabilir alanlar: ${ALLOWED_PLACEHOLDERS.map((t) => `{{${t}}}`).join(', ')}`,
      );
    }
  }

  private async findTemplate(code: string) {
    const [template] = await this.db.select().from(documentTemplates).where(eq(documentTemplates.code, code));
    if (!template) throw new NotFoundException('Şablon bulunamadı');
    return template;
  }

  private async findVersion(code: string, versionId: string) {
    const [v] = await this.db
      .select(versionColumns)
      .from(templateVersions)
      .where(and(eq(templateVersions.id, versionId), eq(templateVersions.templateCode, code)));
    if (!v) throw new NotFoundException('Sürüm bulunamadı');
    return v;
  }
}

function sha256(content: Buffer) {
  return createHash('sha256').update(content).digest('hex');
}

function newVersion(code: string, versionNo: number, userId: string, file: Buffer, fileName: string, note?: string | null) {
  return {
    templateCode: code,
    versionNo,
    fileName,
    content: file,
    sizeBytes: file.length,
    sha256: sha256(file),
    note: note ?? null,
    createdBy: userId,
  };
}

/** Sürümlere durum ekler; sürümler numaraya göre azalan sırada gelmelidir. */
function withStates(versions: VersionRow[], now: Date) {
  const current = versions
    .filter((v) => v.status === 'published' && v.effectiveFrom && v.effectiveFrom <= now)
    .sort((a, b) => b.effectiveFrom!.getTime() - a.effectiveFrom!.getTime() || b.versionNo - a.versionNo)[0];
  return versions.map((v) => {
    let state: TemplateVersionState;
    if (v.status === 'draft') state = 'draft';
    else if (v.id === current?.id) state = 'current';
    else if (v.effectiveFrom && v.effectiveFrom > now) state = 'scheduled';
    else state = 'past';
    return { ...v, state };
  });
}
