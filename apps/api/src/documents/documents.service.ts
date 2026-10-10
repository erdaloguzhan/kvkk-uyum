import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DocumentCategory, ORGANIZATION_PLACEHOLDERS } from '@kvkk/shared';
import { and, desc, eq, getTableColumns, inArray, ne } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { Database, InjectDb } from '../db/db.module';
import { documents, documentVersions, organizations } from '../db/schema';
import { TemplatesService } from '../templates/templates.service';
import { isDocx, renderTemplate, RenderResult } from './template-renderer';

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

/** Sürüm bilgisi (dosya içeriği hariç). */
const { content: _content, ...versionColumns } = getTableColumns(documentVersions);

interface NewVersion {
  source: 'template' | 'upload';
  content: Buffer;
  unfilled?: string[];
  note?: string | null;
  /** Dayandığı ana şablon sürümü; verilmezse (yükleme) bir önceki sürümden devralınır. */
  templateVersionId?: string | null;
}

/** Ana şablonun şu an geçerli sürümü (TemplatesService.effective). */
interface EffectiveTemplate {
  template: { code: string; title: string; category: DocumentCategory; optional: boolean };
  version: { id: string; versionNo: number; content: Buffer };
}

type VersionInfo = { documentId: string; versionNo: number; templateVersionId: string | null };

@Injectable()
export class DocumentsService {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly audit: AuditService,
    private readonly templates: TemplatesService,
  ) {}

  /** Yayındaki ana şablonlar ve kuruluşun hangi şablonlardan doküman oluşturduğu. */
  async catalog(orgId: string) {
    const [existing, templates] = await Promise.all([
      this.db
        .select({ id: documents.id, templateCode: documents.templateCode })
        .from(documents)
        .where(eq(documents.organizationId, orgId)),
      this.templates.catalog(),
    ]);
    const byCode = new Map(existing.map((d) => [d.templateCode, d.id]));
    return templates.map((t) => ({
      code: t.code,
      title: t.title,
      category: t.category,
      optional: t.optional,
      versionNo: t.effectiveVersion.versionNo,
      effectiveFrom: t.effectiveVersion.effectiveFrom,
      documentId: byCode.get(t.code) ?? null,
    }));
  }

  /** Şablondan kuruluşa özel doküman oluşturur; ilk sürüm taslak olarak eklenir. */
  async createFromTemplate(orgId: string, userId: string, templateCode: string) {
    const effective = await this.templates.effective(templateCode);
    const { template } = effective;
    const rendered = await this.render(orgId, effective);
    const result = await this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: documents.id })
        .from(documents)
        .where(and(eq(documents.organizationId, orgId), eq(documents.code, template.code)));
      if (existing) throw new ConflictException('Bu şablondan doküman zaten oluşturulmuş');
      return this.insertDocument(tx, orgId, userId, effective, rendered);
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
    const pending = (await this.templates.catalog()).filter((t) => !t.optional && !existingCodes.has(t.code));

    const rendered: { template: EffectiveTemplate['template']; effective: EffectiveTemplate; r: RenderResult }[] = [];
    const missing = new Set<string>();
    for (const t of pending) {
      const effective = await this.templates.effective(t.code);
      const r = await this.renderUnchecked(orgId, effective);
      r.missing.forEach((m) => missing.add(m));
      rendered.push({ template: effective.template, effective, r });
    }
    if (missing.size > 0) throw this.missingFieldsError([...missing]);

    const created = await this.db.transaction(async (tx) => {
      const ids: string[] = [];
      for (const { effective, r } of rendered) {
        ids.push((await this.insertDocument(tx, orgId, userId, effective, r)).id);
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
    const updates = canSeeDrafts ? await this.templateUpdates(docs, versions) : new Map();
    return docs
      .map((d) => {
        const own = versions.filter((v) => v.documentId === d.id);
        return {
          ...d,
          publishedVersion: own.find((v) => v.id === d.publishedVersionId) ?? null,
          latestVersion: canSeeDrafts ? (own[0] ?? null) : undefined,
          templateUpdate: canSeeDrafts ? (updates.get(d.id) ?? null) : undefined,
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
    if (!canSeeDrafts) return { ...doc, versions: visible };
    const updates = await this.templateUpdates([doc], versions);
    return { ...doc, versions: visible, templateUpdate: updates.get(doc.id) ?? null };
  }

  /**
   * Şablondan üretilmiş dokümanlardan, dayandığı ana şablon sürümünden daha yeni bir sürümü yayında
   * olanlar ("güncelleme mevcut"). Doküman kendiliğinden değişmez; kullanıcı yeniden oluşturarak günceller.
   * `versions` dokümanların tüm sürümlerini numaraya göre azalan sırada içermelidir.
   */
  private async templateUpdates(
    docs: { id: string; templateCode: string | null }[],
    versions: VersionInfo[],
  ) {
    const result = new Map<string, { versionNo: number; effectiveFrom: Date | null }>();
    const fromTemplate = docs.filter((d) => d.templateCode);
    if (fromTemplate.length === 0) return result;
    const latestOf = new Map<string, VersionInfo>();
    for (const v of versions) if (!latestOf.has(v.documentId)) latestOf.set(v.documentId, v);
    const baseIds = [...latestOf.values()].map((v) => v.templateVersionId).filter((x): x is string => !!x);
    const [effective, baseNumbers] = await Promise.all([
      this.templates.effectiveVersions(),
      this.templates.versionNumbers(baseIds),
    ]);
    for (const d of fromTemplate) {
      const current = effective.get(d.templateCode!);
      if (!current) continue;
      const baseId = latestOf.get(d.id)?.templateVersionId;
      // Sürüm takibinden önce üretilmiş dokümanlar ilk şablon sürümüne dayanır.
      const baseNo = baseId ? (baseNumbers.get(baseId) ?? 1) : 1;
      if (current.versionNo > baseNo) {
        result.set(d.id, { versionNo: current.versionNo, effectiveFrom: current.effectiveFrom });
      }
    }
    return result;
  }

  /**
   * Şablonun şu an geçerli sürümünü kuruluşun güncel bilgileriyle yeniden doldurup yeni taslak sürüm ekler
   * (ör. adres değiştiğinde veya ana şablonun yeni sürümü yayınlandığında).
   */
  async regenerate(orgId: string, userId: string, documentId: string, note?: string | null) {
    const doc = await this.findDocument(orgId, documentId);
    if (!doc.templateCode) throw new BadRequestException('Bu doküman bir şablondan oluşturulmamış');
    const effective = await this.templates.effective(doc.templateCode);
    const rendered = await this.render(orgId, effective);
    return this.addVersion(orgId, userId, doc.id, {
      source: 'template',
      ...rendered,
      note,
      templateVersionId: effective.version.id,
    });
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

  private async render(orgId: string, effective: EffectiveTemplate) {
    const r = await this.renderUnchecked(orgId, effective);
    if (r.missing.length > 0) throw this.missingFieldsError(r.missing);
    return r;
  }

  private async renderUnchecked(orgId: string, effective: EffectiveTemplate) {
    const [org] = await this.db.select().from(organizations).where(eq(organizations.id, orgId));
    const values = Object.fromEntries(
      Object.entries(ORGANIZATION_PLACEHOLDERS).map(([placeholder, field]) => [placeholder, org[field]]),
    );
    return renderTemplate(effective.version.content, values);
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
    effective: EffectiveTemplate,
    rendered: { content: Buffer; unfilled: string[] },
  ) {
    const { template } = effective;
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
    await this.insertVersion(tx, doc, 1, userId, {
      source: 'template',
      ...rendered,
      templateVersionId: effective.version.id,
    });
    return doc;
  }

  private async addVersion(orgId: string, userId: string, documentId: string, v: NewVersion) {
    const version = await this.db.transaction(async (tx) => {
      const doc = await this.lockDocument(tx, orgId, documentId);
      const [last] = await tx
        .select({ versionNo: documentVersions.versionNo, templateVersionId: documentVersions.templateVersionId })
        .from(documentVersions)
        .where(eq(documentVersions.documentId, doc.id))
        .orderBy(desc(documentVersions.versionNo))
        .limit(1);
      await tx.update(documents).set({ updatedAt: new Date() }).where(eq(documents.id, doc.id));
      return this.insertVersion(tx, doc, (last?.versionNo ?? 0) + 1, userId, {
        ...v,
        templateVersionId: v.templateVersionId === undefined ? (last?.templateVersionId ?? null) : v.templateVersionId,
      });
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
        templateVersionId: v.templateVersionId ?? null,
        createdBy: userId,
      })
      .returning(versionColumns);
    return version;
  }
}
