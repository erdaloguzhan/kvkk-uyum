import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, gte, inArray, isNull, or, sql } from 'drizzle-orm';
import mammoth from 'mammoth';
import { AuditService } from '../audit/audit.service';
import { MailerService } from '../auth/mailer.service';
import { SmsService } from '../auth/sms.service';
import { Database, InjectDb } from '../db/db.module';
import { documentReads, documents, documentVersions, employees, organizations } from '../db/schema';
import { dateIn } from '../workflow/dates';
import { PortalAuthService, TraineeToken } from './portal-auth.service';

const fullName = (e: { firstName: string; lastName: string }) => `${e.firstName} ${e.lastName}`;

/**
 * Çalışanların eğitim portalında gördüğü dokümanlar. Ayrı bir İzleyici hesabı yerine çalışan, portal
 * hesabıyla (e-postası) kayıtlı olduğu ve işten çıkmadığı kuruluşların yayınlanmış ve çalışanlara açık
 * dokümanlarını görür.
 */
@Injectable()
export class PortalDocumentsService {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly portalAuth: PortalAuthService,
    private readonly mailer: MailerService,
    private readonly sms: SmsService,
    private readonly audit: AuditService,
  ) {}

  /** Bu cep telefonuyla kayıtlı, işten çıkmamış çalışan kayıtlarının kuruluşları. */
  private activeEmployment(phone: string) {
    return and(
      eq(employees.phone, phone),
      or(isNull(employees.terminationDate), gte(employees.terminationDate, dateIn(new Date()))),
    );
  }

  async list(token: TraineeToken) {
    const rows = await this.db
      .selectDistinct({
        id: documents.id,
        organizationId: organizations.id,
        organizationName: organizations.name,
        code: documents.code,
        title: documents.title,
        category: documents.category,
        versionId: documentVersions.id,
        versionNo: documentVersions.versionNo,
        publishedAt: documentVersions.publishedAt,
        // Yayındaki sürüm için verilmiş "Okudum, anladım." onayı.
        confirmedAt: documentReads.confirmedAt,
      })
      .from(employees)
      .innerJoin(organizations, eq(organizations.id, employees.organizationId))
      .innerJoin(documents, eq(documents.organizationId, employees.organizationId))
      .innerJoin(documentVersions, eq(documentVersions.id, documents.publishedVersionId))
      .leftJoin(
        documentReads,
        and(eq(documentReads.versionId, documentVersions.id), eq(documentReads.employeeId, employees.id)),
      )
      .where(and(this.activeEmployment(token.sub), eq(documents.employeeVisible, true)))
      .orderBy(asc(organizations.name), asc(documents.code));
    return rows;
  }

  /** Çalışanın görebileceği dokümanın yayındaki sürümü ve dokümanın kuruluşundaki çalışan kaydı. */
  private async published(token: TraineeToken, documentId: string) {
    const [row] = await this.db
      .select({
        id: documents.id,
        organizationId: documents.organizationId,
        organizationName: organizations.name,
        code: documents.code,
        title: documents.title,
        category: documents.category,
        employeeId: employees.id,
        versionId: documentVersions.id,
        versionNo: documentVersions.versionNo,
        publishedAt: documentVersions.publishedAt,
        fileName: documentVersions.fileName,
        content: documentVersions.content,
      })
      .from(employees)
      .innerJoin(organizations, eq(organizations.id, employees.organizationId))
      .innerJoin(documents, eq(documents.organizationId, employees.organizationId))
      .innerJoin(documentVersions, eq(documentVersions.id, documents.publishedVersionId))
      .where(
        and(this.activeEmployment(token.sub), eq(documents.id, documentId), eq(documents.employeeVisible, true)),
      )
      .limit(1);
    if (!row) throw new NotFoundException('Doküman bulunamadı');
    return row;
  }

  async file(token: TraineeToken, documentId: string) {
    const doc = await this.published(token, documentId);
    await this.audit.record({
      action: 'document.portal_downloaded',
      organizationId: doc.organizationId,
      entityType: 'document',
      entityId: doc.id,
      metadata: { employeeId: doc.employeeId, versionNo: doc.versionNo, account: token.sub },
    });
    return doc;
  }

  /**
   * Dokümanı portalda okumak için HTML'e çevirir. Biçimlendirme yalnızca başlık, paragraf, liste, tablo
   * ve resim düzeyindedir; web arayüzü bu HTML'i izin verilen etiketlerle süzerek gösterir.
   */
  async view(token: TraineeToken, documentId: string) {
    const { content, fileName: _f, ...doc } = await this.published(token, documentId);
    const { value: html } = await mammoth.convertToHtml({ buffer: content });
    const [read] = await this.db
      .select({ confirmedAt: documentReads.confirmedAt })
      .from(documentReads)
      .where(and(eq(documentReads.versionId, doc.versionId), eq(documentReads.employeeId, doc.employeeId)));
    await this.audit.record({
      action: 'document.portal_viewed',
      organizationId: doc.organizationId,
      entityType: 'document',
      entityId: doc.id,
      metadata: { employeeId: doc.employeeId, versionNo: doc.versionNo, account: token.sub },
    });
    const { employeeId: _e, ...rest } = doc;
    return { ...rest, html, confirmedAt: read?.confirmedAt ?? null };
  }

  /**
   * "Okudum, anladım." onayı. Onay okunan sürüme bağlanır; bu arada yeni sürüm yayınlandıysa reddedilir
   * ve çalışan yeni sürümü okur. Aynı sürüm ikinci kez onaylanırsa ilk onay korunur.
   */
  async confirmRead(token: TraineeToken, documentId: string, versionId: string, client: { ip: string | null; userAgent: string | null }) {
    const doc = await this.published(token, documentId);
    if (doc.versionId !== versionId) {
      throw new ConflictException('Doküman bu arada güncellendi; lütfen yeni sürümü okuyup onaylayın');
    }
    const inserted = await this.db
      .insert(documentReads)
      .values({
        organizationId: doc.organizationId,
        documentId: doc.id,
        versionId,
        employeeId: doc.employeeId,
        ip: client.ip,
        userAgent: client.userAgent,
      })
      .onConflictDoNothing({ target: [documentReads.versionId, documentReads.employeeId] })
      .returning({ confirmedAt: documentReads.confirmedAt });
    if (inserted.length > 0) {
      await this.audit.record({
        action: 'document.read_confirmed',
        organizationId: doc.organizationId,
        entityType: 'document',
        entityId: doc.id,
        metadata: { employeeId: doc.employeeId, versionId, versionNo: doc.versionNo, account: token.sub },
      });
      return { confirmedAt: inserted[0].confirmedAt, versionNo: doc.versionNo };
    }
    const [existing] = await this.db
      .select({ confirmedAt: documentReads.confirmedAt })
      .from(documentReads)
      .where(and(eq(documentReads.versionId, versionId), eq(documentReads.employeeId, doc.employeeId)));
    return { confirmedAt: existing.confirmedAt, versionNo: doc.versionNo };
  }

  /**
   * Kuruluş tarafı için dokümanın okuma kayıtları: hangi çalışan hangi sürümü ne zaman onayladı ve
   * yayındaki sürümü henüz onaylamamış (portal erişimi olan, işten çıkmamış) çalışanlar.
   */
  async readReport(orgId: string, documentId: string) {
    const [doc] = await this.db
      .select({
        id: documents.id,
        employeeVisible: documents.employeeVisible,
        versionId: documents.publishedVersionId,
        versionNo: documentVersions.versionNo,
      })
      .from(documents)
      .leftJoin(documentVersions, eq(documentVersions.id, documents.publishedVersionId))
      .where(and(eq(documents.id, documentId), eq(documents.organizationId, orgId)));
    if (!doc) throw new NotFoundException('Doküman bulunamadı');
    const reads = await this.db
      .select({
        id: documentReads.id,
        confirmedAt: documentReads.confirmedAt,
        versionId: documentReads.versionId,
        versionNo: documentVersions.versionNo,
        employee: { id: employees.id, firstName: employees.firstName, lastName: employees.lastName, email: employees.email },
      })
      .from(documentReads)
      .innerJoin(documentVersions, eq(documentVersions.id, documentReads.versionId))
      .innerJoin(employees, eq(employees.id, documentReads.employeeId))
      .where(eq(documentReads.documentId, documentId))
      .orderBy(desc(documentReads.confirmedAt));
    const confirmedCurrent = new Set(reads.filter((r) => r.versionId === doc.versionId).map((r) => r.employee.id));
    const today = dateIn(new Date());
    const active = await this.db
      .select({ id: employees.id, firstName: employees.firstName, lastName: employees.lastName, email: employees.email })
      .from(employees)
      .where(
        and(
          eq(employees.organizationId, orgId),
          sql`${employees.phone} is not null and ${employees.phone} <> ''`,
          or(isNull(employees.terminationDate), gte(employees.terminationDate, today)),
        ),
      )
      .orderBy(asc(employees.firstName), asc(employees.lastName));
    return {
      publishedVersion: doc.versionId ? { id: doc.versionId, versionNo: doc.versionNo } : null,
      employeeVisible: doc.employeeVisible,
      reads,
      notConfirmed: doc.versionId ? active.filter((e) => !confirmedCurrent.has(e.id)) : [],
    };
  }

  /**
   * Çalışanlara portal bağlantısını SMS ile (e-postası varsa ayrıca e-postayla) gönderir. Portalda şifre yoktur.
   * `employeeIds` verilmezse kuruluşun cep telefonu olan ve işten çıkmamış tüm çalışanlarına gönderilir.
   */
  async sendAccess(adminId: string, orgId: string, employeeIds?: string[]) {
    const [org] = await this.db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, orgId));
    if (!org) throw new NotFoundException('Kuruluş bulunamadı');
    const conditions = [eq(employees.organizationId, orgId)];
    if (employeeIds) conditions.push(inArray(employees.id, employeeIds));
    const targets = await this.db.select().from(employees).where(and(...conditions));
    if (targets.length === 0) throw new BadRequestException('Gönderilecek çalışan yok');

    const today = dateIn(new Date());
    const sent: string[] = [];
    const skipped: { name: string; reason: string }[] = [];
    for (const e of targets) {
      const name = fullName(e);
      if (!e.phone) {
        skipped.push({ name, reason: 'Cep telefonu yok' });
        continue;
      }
      if (e.terminationDate && e.terminationDate < today) {
        skipped.push({ name, reason: 'İşten çıkmış' });
        continue;
      }
      try {
        await this.sms.send({
          to: e.phone,
          text: `${org.name.length > 40 ? `${org.name.slice(0, 39)}…` : org.name}: KVKK dokümanlarını Eğitim Portalında okuyabilirsiniz: ${this.portalAuth.portalUrl} (cep telefonunuz ve SMS kodu ile giriş)`,
        });
      } catch {
        skipped.push({ name, reason: 'SMS gönderilemedi' });
        continue;
      }
      if (e.email) {
        await this.mailer.send({
          to: e.email,
          subject: `${org.name} - KVKK dokümanları`,
          text:
            `Merhaba ${name},\n\n${org.name} KVKK politika ve prosedürlerini Eğitim Portalında okuyabilirsiniz.\n\n` +
            `Eğitim Portalı: ${this.portalAuth.portalUrl}\n` +
            `Giriş için cep telefonunuzu (${e.phone}) yazın; telefonunuza SMS ile gelen kodu girin.\n`,
        });
      }
      sent.push(e.id);
    }
    await this.audit.record({
      action: 'training.portal_access_sent',
      organizationId: orgId,
      userId: adminId,
      entityType: 'organization',
      entityId: orgId,
      metadata: { sent: sent.length, skipped: skipped.length },
    });
    return { sent: sent.length, skipped };
  }
}
