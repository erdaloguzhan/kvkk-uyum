import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, gte, inArray, isNull, or, sql } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';
import { MailerService } from '../auth/mailer.service';
import { Database, InjectDb } from '../db/db.module';
import { documents, documentVersions, employees, organizations } from '../db/schema';
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
    private readonly audit: AuditService,
  ) {}

  /** Hesabın e-postasıyla kayıtlı, işten çıkmamış çalışan kayıtlarının kuruluşları. */
  private activeEmployment(email: string) {
    return and(
      sql`lower(${employees.email}) = lower(${email})`,
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
      })
      .from(employees)
      .innerJoin(organizations, eq(organizations.id, employees.organizationId))
      .innerJoin(documents, eq(documents.organizationId, employees.organizationId))
      .innerJoin(documentVersions, eq(documentVersions.id, documents.publishedVersionId))
      .where(and(this.activeEmployment(token.email), eq(documents.employeeVisible, true)))
      .orderBy(asc(organizations.name), asc(documents.code));
    return rows;
  }

  async file(token: TraineeToken, documentId: string) {
    const [row] = await this.db
      .select({ fileName: documentVersions.fileName, content: documentVersions.content })
      .from(employees)
      .innerJoin(documents, eq(documents.organizationId, employees.organizationId))
      .innerJoin(documentVersions, eq(documentVersions.id, documents.publishedVersionId))
      .where(
        and(this.activeEmployment(token.email), eq(documents.id, documentId), eq(documents.employeeVisible, true)),
      )
      .limit(1);
    if (!row) throw new NotFoundException('Doküman bulunamadı');
    return row;
  }

  /**
   * Çalışanlara portal erişimi gönderir: hesabı yoksa geçici şifreyle açılır. `employeeIds` verilmezse
   * kuruluşun e-postası olan ve işten çıkmamış tüm çalışanlarına gönderilir.
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
      if (!e.email) {
        skipped.push({ name, reason: 'E-posta adresi yok' });
        continue;
      }
      if (e.terminationDate && e.terminationDate < today) {
        skipped.push({ name, reason: 'İşten çıkmış' });
        continue;
      }
      const creds = await this.portalAuth.issueCredentials(e.email);
      const login = creds.temporaryPassword
        ? `Kullanıcı adınız: ${e.email}\nGeçici şifreniz: ${creds.temporaryPassword}\n\n` +
          'İlk girişte şifrenizi değiştirmeniz istenecektir.\n'
        : `Kullanıcı adınız: ${e.email}\nMevcut Eğitim Portalı şifrenizle giriş yapabilirsiniz. ` +
          'Şifrenizi hatırlamıyorsanız giriş sayfasındaki "Şifremi unuttum" bağlantısını kullanın.\n';
      await this.mailer.send({
        to: e.email,
        subject: `${org.name} - KVKK dokümanları`,
        text:
          `Merhaba ${name},\n\n${org.name} KVKK politika ve prosedürlerini Eğitim Portalında okuyabilirsiniz.\n\n` +
          `Eğitim Portalı: ${this.portalAuth.portalUrl}\n${login}`,
      });
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
