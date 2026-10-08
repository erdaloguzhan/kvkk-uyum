import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DOCUMENT_TEMPLATES,
  DocumentTemplateDefinition,
  ORGANIZATION_PLACEHOLDERS,
} from '@kvkk/shared';
import { and, desc, eq, getTableColumns, inArray, ne } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { AuditService } from '../audit/audit.service';
import { AppConfig, CONFIG } from '../config';
import { Database, InjectDb } from '../db/db.module';
import { documents, documentVersions, organizations } from '../db/schema';
import { isDocx, renderTemplate, RenderResult } from './template-renderer';

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

/** Sürüm bilgisi (dosya içeriği hariç). */
const { content: _content, ...versionColumns } = getTableColumns(documentVersions);

interface NewVersion {
  source: 'template' | 'upload';
  content: Buffer;
  unfilled?: string[];
  note?: string | null;
}

@Injectable()
export class DocumentsService {
  constructor(
    @InjectDb() private readonly db: Database,
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly audit: AuditService,
  ) {}

  /** Şablon kataloğu ve kuruluşun hangi şablonlardan doküman oluşturduğu. */
  async catalog(orgId: string) {
    const existing = await this.db
      .select({ id: documents.id, templateCode: documents.templateCode })
      .from(documents)
      .where(eq(documents.organizationId, orgId));
    const byCode = new Map(existing.map((d) => [d.templateCode, d.id]));
    return DOCUMENT_TEMPLATES.map((t) => ({
      code: t.code,
      title: t.title,
      category: t.category,
      optional: t.optional,
      documentId: byCode.get(t.code) ?? null,
    }));
  }

  /** Şablondan kuruluşa özel doküman oluşturur; ilk sürüm taslak olarak eklenir. */
  async createFromTemplate(orgId: string, userId: string, templateCode: string) {
    const template = this.findTemplate(templateCode);
    const rendered = await this.render(orgId, template);
    const result = await this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: documents.id })
        .from(documents)
        .where(and(eq(documents.organizationId, orgId), eq(documents.code, template.code)));
      if (existing) throw new ConflictException('Bu şablondan doküman zaten oluşturulmuş');
      return this.insertDocument(tx, orgId, userId, template, rendered);
    });
    await this.audit.record({
      action: 'document.created',
      organizationId: orgId,
      userId,
      entityType: 'document',
      entityId: result.id,
      metadata: { templateCode: template.code },
    });
    return this.get(orgId, result.id, true);
  }

  /**
   * Kurulum: opsiyonel olmayan ve henüz oluşturulmamış tüm şablonlardan doküman oluşturur.
   * Kuruluş profilinde eksik alan varsa hiçbir doküman oluşturulmaz.
   */
  async setupDefaults(orgId: string, userId: string) {
    const existing = await this.db
      .select({ code: documents.code })
      .from(documents)
      .where(eq(documents.organizationId, orgId));
    const existingCodes = new Set(existing.map((d) => d.code));
    const pending = DOCUMENT_TEMPLATES.filter((t) => !t.optional && !existingCodes.has(t.code));

    const rendered: { template: DocumentTemplateDefinition; r: RenderResult }[] = [];
    const missing = new Set<string>();
    for (const template of pending) {
      const r = await this.renderUnchecked(orgId, template);
      r.missing.forEach((m) => missing.add(m));
      rendered.push({ template, r });
    }
    if (missing.size > 0) throw this.missingFieldsError([...missing]);

    const created = await this.db.transaction(async (tx) => {
      const ids: string[] = [];
      for (const { template, r } of rendered) {
        ids.push((await this.insertDocument(tx, orgId, userId, template, r)).id);
      }
      return ids;
    });
    await this.audit.record({
      action: 'document.setup',
      organizationId: orgId,
      userId,
      metadata: { created: rendered.map((x) => x.template.code) },
    });
    return {
      created: rendered.map((x, i) => ({ id: created[i], code: x.template.code })),
      skipped: [...existingCodes].sort(),
    };
  }

  async list(orgId: string, canSeeDrafts: boolean) {
    const docs = await this.db
      .select()
      .from(documents)
      .where(eq(documents.organizationId, orgId))
      .orderBy(documents.code);
    if (docs.length === 0) return [];
    const versions = await this.db
      .select(versionColumns)
      .from(documentVersions)
      .where(inArray(documentVersions.documentId, docs.map((d) => d.id)))
      .orderBy(desc(documentVersions.versionNo));
    return docs
      .map((d) => {
        const own = versions.filter((v) => v.documentId === d.id);
        return {
          ...d,
          publishedVersion: own.find((v) => v.id === d.publishedVersionId) ?? null,
          latestVersion: canSeeDrafts ? (own[0] ?? null) : undefined,
        };
      })
      .filter((d) => canSeeDrafts || d.publishedVersion);
  }

  /** Doküman ve sürümleri. Taslak görme yetkisi olmayanlar yalnızca yayındaki sürümü görür. */
  async get(orgId: string, documentId: string, canSeeDrafts: boolean) {
    const doc = await this.findDocument(orgId, documentId);
    const versions = await this.db
      .select(versionColumns)
      .from(documentVersions)
      .where(eq(documentVersions.documentId, doc.id))
      .orderBy(desc(documentVersions.versionNo));
    const visible = canSeeDrafts ? versions : versions.filter((v) => v.id === doc.publishedVersionId);
    if (visible.length === 0) throw new NotFoundException('Doküman bulunamadı');
    return { ...doc, versions: visible };
  }

  /** Şablonu kuruluşun güncel bilgileriyle yeniden doldurup yeni taslak sürüm ekler. */
  async regenerate(orgId: string, userId: string, documentId: string, note?: string | null) {
    const doc = await this.findDocument(orgId, documentId);
    if (!doc.templateCode) throw new BadRequestException('Bu doküman bir şablondan oluşturulmamış');
    const rendered = await this.render(orgId, this.findTemplate(doc.templateCode));
    return this.addVersion(orgId, userId, doc.id, { source: 'template', ...rendered, note });
  }

  /** Kullanıcının düzenleyip yüklediği Word dosyasını yeni taslak sürüm olarak ekler. */
  async upload(orgId: string, userId: string, documentId: string, file: Buffer, note?: string | null) {
    if (!isDocx(file)) throw new BadRequestException('Dosya geçerli bir Word (.docx) dokümanı değil');
    const doc = await this.findDocument(orgId, documentId);
    return this.addVersion(orgId, userId, doc.id, { source: 'upload', content: file, note });
  }

  /** Taslak sürümü yayınlar; önceki yayındaki sürüm yürürlükten kalkar. */
  async publish(orgId: string, userId: string, documentId: string, versionId: string) {
    const result = await this.db.transaction(async (tx) => {
      const doc = await this.lockDocument(tx, orgId, documentId);
      const [version] = await tx
        .select(versionColumns)
        .from(documentVersions)
        .where(and(eq(documentVersions.id, versionId), eq(documentVersions.documentId, doc.id)));
      if (!version) throw new NotFoundException('Sürüm bulunamadı');
      if (version.status !== 'draft') throw new ConflictException('Yalnızca taslak sürüm yayınlanabilir');
      const previous = await tx
        .select({ versionNo: documentVersions.versionNo })
        .from(documentVersions)
        .where(and(eq(documentVersions.documentId, doc.id), ne(documentVersions.status, 'draft')))
        .orderBy(desc(documentVersions.versionNo))
        .limit(1);
      if (previous[0] && previous[0].versionNo > version.versionNo) {
        throw new ConflictException('Yayındaki sürümden eski bir taslak yayınlanamaz');
      }

      const now = new Date();
      await tx
        .update(documentVersions)
        .set({ status: 'superseded' })
        .where(and(eq(documentVersions.documentId, doc.id), eq(documentVersions.status, 'published')));
      await tx
        .update(documentVersions)
        .set({ status: 'published', publishedAt: now, publishedBy: userId })
        .where(eq(documentVersions.id, version.id));
      await tx
        .update(documents)
        .set({ publishedVersionId: version.id, updatedAt: now })
        .where(eq(documents.id, doc.id));
      return { versionNo: version.versionNo };
    });
    await this.audit.record({
      action: 'document.published',
      organizationId: orgId,
      userId,
      entityType: 'document',
      entityId: documentId,
      metadata: { versionId, versionNo: result.versionNo },
    });
    return this.get(orgId, documentId, true);
  }

  async file(orgId: string, documentId: string, versionId: string, canSeeDrafts: boolean) {
    const doc = await this.findDocument(orgId, documentId);
    const [version] = await this.db
      .select({
        fileName: documentVersions.fileName,
        content: documentVersions.content,
        status: documentVersions.status,
      })
      .from(documentVersions)
      .where(and(eq(documentVersions.id, versionId), eq(documentVersions.documentId, doc.id)));
    if (!version || (!canSeeDrafts && versionId !== doc.publishedVersionId)) {
      throw new NotFoundException('Sürüm bulunamadı');
    }
    return version;
  }

  private findTemplate(code: string) {
    const template = DOCUMENT_TEMPLATES.find((t) => t.code === code);
    if (!template) throw new NotFoundException('Şablon bulunamadı');
    return template;
  }

  private async findDocument(orgId: string, documentId: string) {
    const [doc] = await this.db
      .select()
      .from(documents)
      .where(and(eq(documents.id, documentId), eq(documents.organizationId, orgId)));
    if (!doc) throw new NotFoundException('Doküman bulunamadı');
    return doc;
  }

  /** Sürüm numarası çakışmasın diye doküman satırını işlem sonuna kadar kilitler. */
  private async lockDocument(tx: Tx, orgId: string, documentId: string) {
    const [doc] = await tx
      .select()
      .from(documents)
      .where(and(eq(documents.id, documentId), eq(documents.organizationId, orgId)))
      .for('update');
    if (!doc) throw new NotFoundException('Doküman bulunamadı');
    return doc;
  }

  private async render(orgId: string, template: DocumentTemplateDefinition) {
    const r = await this.renderUnchecked(orgId, template);
    if (r.missing.length > 0) throw this.missingFieldsError(r.missing);
    return r;
  }

  private async renderUnchecked(orgId: string, template: DocumentTemplateDefinition) {
    const [org] = await this.db.select().from(organizations).where(eq(organizations.id, orgId));
    const values = Object.fromEntries(
      Object.entries(ORGANIZATION_PLACEHOLDERS).map(([placeholder, field]) => [placeholder, org[field]]),
    );
    const source = await readFile(path.join(this.config.contentDir, template.file));
    return renderTemplate(source, values);
  }

  /** Eksik yer tutucuları kuruluş profil alanlarına çevirip hata döner. */
  private missingFieldsError(placeholders: string[]) {
    const fields = placeholders.map(
      (p) => ORGANIZATION_PLACEHOLDERS[p as keyof typeof ORGANIZATION_PLACEHOLDERS] ?? p,
    );
    return new BadRequestException({
      message: 'Dokümanı oluşturmak için kuruluş bilgileri eksik',
      missing: [...new Set(fields)].sort(),
    });
  }

  private async insertDocument(
    tx: Tx,
    orgId: string,
    userId: string,
    template: DocumentTemplateDefinition,
    rendered: { content: Buffer; unfilled: string[] },
  ) {
    const [doc] = await tx
      .insert(documents)
      .values({
        organizationId: orgId,
        templateCode: template.code,
        code: template.code,
        title: template.title,
        category: template.category,
        createdBy: userId,
      })
      .returning();
    await this.insertVersion(tx, doc, 1, userId, { source: 'template', ...rendered });
    return doc;
  }

  private async addVersion(orgId: string, userId: string, documentId: string, v: NewVersion) {
    const version = await this.db.transaction(async (tx) => {
      const doc = await this.lockDocument(tx, orgId, documentId);
      const [last] = await tx
        .select({ versionNo: documentVersions.versionNo })
        .from(documentVersions)
        .where(eq(documentVersions.documentId, doc.id))
        .orderBy(desc(documentVersions.versionNo))
        .limit(1);
      await tx.update(documents).set({ updatedAt: new Date() }).where(eq(documents.id, doc.id));
      return this.insertVersion(tx, doc, (last?.versionNo ?? 0) + 1, userId, v);
    });
    await this.audit.record({
      action: 'document.version_added',
      organizationId: orgId,
      userId,
      entityType: 'document',
      entityId: documentId,
      metadata: { versionId: version.id, versionNo: version.versionNo, source: v.source },
    });
    return version;
  }

  private async insertVersion(
    tx: Tx,
    doc: { id: string; code: string; title: string },
    versionNo: number,
    userId: string,
    v: NewVersion,
  ) {
    const [version] = await tx
      .insert(documentVersions)
      .values({
        documentId: doc.id,
        versionNo,
        source: v.source,
        fileName: `${doc.code} ${doc.title} - v${versionNo}.docx`,
        content: v.content,
        sizeBytes: v.content.length,
        sha256: createHash('sha256').update(v.content).digest('hex'),
        unfilledPlaceholders: v.unfilled ?? [],
        note: v.note ?? null,
        createdBy: userId,
      })
      .returning(versionColumns);
    return version;
  }
}
