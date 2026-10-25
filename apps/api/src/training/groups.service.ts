import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNotNull, isNull, SQL } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';
import { MailerService } from '../auth/mailer.service';
import { Database, InjectDb } from '../db/db.module';
import {
  employees,
  organizations,
  trainers,
  trainingExamAttempts,
  trainingGroups,
  trainingParticipants,
  trainingTopics,
  trainings,
} from '../db/schema';
import { certificatePdf } from './certificate';
import { PortalAuthService } from './portal-auth.service';

const byTurkish = (a: string, b: string) => a.localeCompare(b, 'tr');
const fullName = (e: { firstName: string; lastName: string }) => `${e.firstName} ${e.lastName}`;

export interface ResultFilter {
  groupId?: string;
  trainingId?: string;
  organizationId?: string;
}

/** Eğitim grupları, katılımcılar, eğitimin başlatılması (bildirim) ve sınav sonuçları. */
@Injectable()
export class GroupsService {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly portalAuth: PortalAuthService,
    private readonly mailer: MailerService,
    private readonly audit: AuditService,
  ) {}

  /** Grup oluşturmada kuruluş seçimi için. */
  async organizations() {
    const rows = await this.db.select({ id: organizations.id, name: organizations.name }).from(organizations);
    return rows.sort((a, b) => byTurkish(a.name, b.name));
  }

  /** Grup oluşturmada katılımcı seçimi için kuruluşun çalışanları. */
  async employees(orgId: string) {
    const rows = await this.db
      .select({
        id: employees.id,
        nationalId: employees.nationalId,
        firstName: employees.firstName,
        lastName: employees.lastName,
        email: employees.email,
        phone: employees.phone,
        terminationDate: employees.terminationDate,
      })
      .from(employees)
      .where(eq(employees.organizationId, orgId));
    return rows.sort((a, b) => byTurkish(fullName(a), fullName(b)));
  }

  async list(filter: ResultFilter = {}) {
    const conditions: SQL[] = [];
    if (filter.trainingId) conditions.push(eq(trainingGroups.trainingId, filter.trainingId));
    if (filter.organizationId) conditions.push(eq(trainingGroups.organizationId, filter.organizationId));
    const groups = await this.db
      .select({
        id: trainingGroups.id,
        name: trainingGroups.name,
        assignedAt: trainingGroups.assignedAt,
        createdAt: trainingGroups.createdAt,
        organizationId: trainingGroups.organizationId,
        organizationName: organizations.name,
        trainingId: trainingGroups.trainingId,
        trainingName: trainings.name,
        trainerId: trainingGroups.trainerId,
        trainerFirstName: trainers.firstName,
        trainerLastName: trainers.lastName,
      })
      .from(trainingGroups)
      .innerJoin(organizations, eq(organizations.id, trainingGroups.organizationId))
      .innerJoin(trainings, eq(trainings.id, trainingGroups.trainingId))
      .leftJoin(trainers, eq(trainers.id, trainingGroups.trainerId))
      .where(and(...conditions))
      .orderBy(desc(trainingGroups.createdAt));
    const participants = groups.length
      ? await this.db
          .select({ groupId: trainingParticipants.groupId, sentAt: trainingParticipants.sentAt, completedAt: trainingParticipants.completedAt })
          .from(trainingParticipants)
          .where(inArray(trainingParticipants.groupId, groups.map((g) => g.id)))
      : [];
    return groups.map(({ trainerFirstName, trainerLastName, ...g }) => {
      const mine = participants.filter((p) => p.groupId === g.id);
      return {
        ...g,
        trainerName: trainerFirstName ? `${trainerFirstName} ${trainerLastName}` : null,
        participantCount: mine.length,
        sentCount: mine.filter((p) => p.sentAt).length,
        completedCount: mine.filter((p) => p.completedAt).length,
      };
    });
  }

  async get(id: string) {
    const group = (await this.list()).find((g) => g.id === id);
    if (!group) throw new NotFoundException('Eğitim grubu bulunamadı');
    const participants = await this.results({ groupId: id });
    return { ...group, participants };
  }

  async create(userId: string, input: { organizationId: string; trainingId: string; trainerId: string; name: string; employeeIds: string[] }) {
    const [org] = await this.db.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, input.organizationId));
    if (!org) throw new BadRequestException('Kuruluş bulunamadı');
    const [training] = await this.db
      .select({ id: trainings.id, status: trainings.status })
      .from(trainings)
      .where(eq(trainings.id, input.trainingId));
    if (!training) throw new BadRequestException('Eğitim bulunamadı');
    if (training.status !== 'active') {
      throw new BadRequestException('Eğitim henüz yayında değil; önce içerik ve soruları tamamlayıp yayına alın');
    }
    await this.ensureActiveTrainer(input.trainerId);
    const [group] = await this.db
      .insert(trainingGroups)
      .values({ organizationId: input.organizationId, trainingId: input.trainingId, trainerId: input.trainerId, name: input.name, createdBy: userId })
      .returning({ id: trainingGroups.id });
    if (input.employeeIds.length) await this.insertParticipants(group.id, input.organizationId, input.employeeIds);
    await this.audit.record({
      action: 'training.group_created',
      organizationId: input.organizationId,
      userId,
      entityType: 'training_group',
      entityId: group.id,
      metadata: { participants: input.employeeIds.length },
    });
    return this.get(group.id);
  }

  /** Grup adı ve eğitimcisi değiştirilebilir; eğitimci sonradan oluşturulan sertifikalarda yazar. */
  async update(userId: string, id: string, input: { name?: string; trainerId?: string }) {
    const group = await this.find(id);
    if (input.trainerId) await this.ensureActiveTrainer(input.trainerId);
    await this.db.update(trainingGroups).set(input).where(eq(trainingGroups.id, id));
    await this.audit.record({
      action: 'training.group_updated',
      organizationId: group.organizationId,
      userId,
      entityType: 'training_group',
      entityId: id,
      metadata: { fields: Object.keys(input) },
    });
    return this.get(id);
  }

  private async ensureActiveTrainer(id: string) {
    const [row] = await this.db.select({ isActive: trainers.isActive }).from(trainers).where(eq(trainers.id, id));
    if (!row) throw new BadRequestException('Eğitimci bulunamadı');
    if (!row.isActive) throw new BadRequestException('Pasif eğitimci gruba atanamaz');
  }

  async remove(userId: string, id: string) {
    const group = await this.find(id);
    const [sent] = await this.db
      .select({ id: trainingParticipants.id })
      .from(trainingParticipants)
      .where(and(eq(trainingParticipants.groupId, id), isNotNull(trainingParticipants.sentAt)));
    if (group.assignedAt || sent) throw new ConflictException('Başlatılmış eğitim grubu silinemez');
    await this.db.delete(trainingGroups).where(eq(trainingGroups.id, id));
    await this.audit.record({ action: 'training.group_deleted', organizationId: group.organizationId, userId, entityType: 'training_group', entityId: id });
  }

  async addParticipants(userId: string, id: string, employeeIds: string[]) {
    const group = await this.find(id);
    const added = await this.insertParticipants(id, group.organizationId, employeeIds);
    await this.audit.record({
      action: 'training.participants_added',
      organizationId: group.organizationId,
      userId,
      entityType: 'training_group',
      entityId: id,
      metadata: { added },
    });
    return this.get(id);
  }

  /** Eğitim kendisine gönderilmemiş katılımcı gruptan çıkarılabilir. */
  async removeParticipant(userId: string, id: string, participantId: string) {
    const group = await this.find(id);
    const [p] = await this.db
      .select()
      .from(trainingParticipants)
      .where(and(eq(trainingParticipants.id, participantId), eq(trainingParticipants.groupId, id)));
    if (!p) throw new NotFoundException('Katılımcı bulunamadı');
    if (p.sentAt) throw new ConflictException('Eğitimi gönderilmiş katılımcı gruptan çıkarılamaz');
    await this.db.delete(trainingParticipants).where(eq(trainingParticipants.id, participantId));
    await this.audit.record({
      action: 'training.participant_removed',
      organizationId: group.organizationId,
      userId,
      entityType: 'training_participant',
      entityId: participantId,
    });
    return this.get(id);
  }

  /**
   * Eğitimi başlatır: katılımcılara eğitim portalı bağlantısı ve giriş bilgileri e-postayla gönderilir.
   * `participantIds` verilmezse henüz gönderilmemiş katılımcılara gönderilir. E-postası olmayan çalışan atlanır.
   */
  async send(userId: string, id: string, participantIds?: string[]) {
    const group = await this.find(id);
    const [training] = await this.db
      .select({ name: trainings.name, status: trainings.status })
      .from(trainings)
      .where(eq(trainings.id, group.trainingId));
    if (training.status !== 'active') throw new BadRequestException('Eğitim yayında değil');
    const [org] = await this.db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, group.organizationId));

    const conditions = [eq(trainingParticipants.groupId, id)];
    conditions.push(participantIds ? inArray(trainingParticipants.id, participantIds) : isNull(trainingParticipants.sentAt));
    const targets = await this.db
      .select({ id: trainingParticipants.id, completedAt: trainingParticipants.completedAt, employee: employees })
      .from(trainingParticipants)
      .innerJoin(employees, eq(employees.id, trainingParticipants.employeeId))
      .where(and(...conditions));
    if (targets.length === 0) throw new BadRequestException('Gönderilecek katılımcı yok');

    const sent: string[] = [];
    const skipped: { name: string; reason: string }[] = [];
    for (const t of targets) {
      const name = fullName(t.employee);
      if (!t.employee.email) {
        skipped.push({ name, reason: 'E-posta adresi yok' });
        continue;
      }
      if (!t.employee.phone) {
        skipped.push({ name, reason: 'Cep telefonu yok (portal kullanıcı adı)' });
        continue;
      }
      if (t.completedAt) {
        skipped.push({ name, reason: 'Eğitimi tamamlamış' });
        continue;
      }
      const creds = await this.portalAuth.issueCredentials(t.employee.email);
      const login = creds.temporaryPassword
        ? `Kullanıcı adınız (cep telefonunuz): ${t.employee.phone}\nGeçici şifreniz: ${creds.temporaryPassword}\n\n` +
          'İlk girişte şifrenizi değiştirmeniz istenecektir.\n'
        : `Kullanıcı adınız (cep telefonunuz): ${t.employee.phone}\nMevcut Eğitim Portalı şifrenizle giriş yapabilirsiniz. ` +
          'Şifrenizi hatırlamıyorsanız giriş sayfasındaki "Şifremi unuttum" bağlantısını kullanın.\n';
      await this.mailer.send({
        to: t.employee.email,
        subject: `${training.name} - Uzaktan eğitim`,
        text:
          `Merhaba ${name},\n\n${org.name} tarafından "${training.name}" eğitimine katılımınız bekleniyor.\n\n` +
          `Eğitim Portalı: ${this.portalAuth.portalUrl}\n${login}\n` +
          'Eğitim bir ön test, ders konuları ve bir son testten oluşur. Eğitimi bitirmeden çıkarsanız tekrar ' +
          'girdiğinizde eğitim baştan başlar.\n',
      });
      await this.db.update(trainingParticipants).set({ sentAt: new Date() }).where(eq(trainingParticipants.id, t.id));
      sent.push(t.id);
    }
    if (sent.length && !group.assignedAt) {
      await this.db.update(trainingGroups).set({ assignedAt: new Date() }).where(eq(trainingGroups.id, id));
    }
    await this.audit.record({
      action: 'training.group_sent',
      organizationId: group.organizationId,
      userId,
      entityType: 'training_group',
      entityId: id,
      metadata: { sent: sent.length, skipped: skipped.length },
    });
    return { sent: sent.length, skipped };
  }

  /** Sınav sonuçları: katılımcı başına ön test notu, son test notu (en son deneme) ve başarı durumu. */
  async results(filter: ResultFilter) {
    const conditions: SQL[] = [];
    if (filter.groupId) conditions.push(eq(trainingParticipants.groupId, filter.groupId));
    if (filter.trainingId) conditions.push(eq(trainingGroups.trainingId, filter.trainingId));
    if (filter.organizationId) conditions.push(eq(trainingGroups.organizationId, filter.organizationId));
    const rows = await this.db
      .select({
        id: trainingParticipants.id,
        groupId: trainingGroups.id,
        groupName: trainingGroups.name,
        organizationName: organizations.name,
        trainingName: trainings.name,
        passScore: trainings.passScore,
        employeeId: employees.id,
        nationalId: employees.nationalId,
        firstName: employees.firstName,
        lastName: employees.lastName,
        email: employees.email,
        phone: employees.phone,
        sentAt: trainingParticipants.sentAt,
        startedAt: trainingParticipants.startedAt,
        completedAt: trainingParticipants.completedAt,
      })
      .from(trainingParticipants)
      .innerJoin(trainingGroups, eq(trainingGroups.id, trainingParticipants.groupId))
      .innerJoin(organizations, eq(organizations.id, trainingGroups.organizationId))
      .innerJoin(trainings, eq(trainings.id, trainingGroups.trainingId))
      .innerJoin(employees, eq(employees.id, trainingParticipants.employeeId))
      .where(and(...conditions));
    const attempts = rows.length
      ? await this.db
          .select()
          .from(trainingExamAttempts)
          .where(inArray(trainingExamAttempts.participantId, rows.map((r) => r.id)))
          .orderBy(asc(trainingExamAttempts.completedAt))
      : [];
    return rows
      .map((r) => {
        const mine = attempts.filter((a) => a.participantId === r.id);
        const pre = mine.find((a) => a.testType === 'pre');
        const posts = mine.filter((a) => a.testType === 'post');
        const lastPost = posts.at(-1);
        // Başarılı deneme varsa o (tamamlama) notu, yoksa son denemenin notu gösterilir.
        const shown = posts.find((a) => a.passed) ?? lastPost;
        return {
          ...r,
          fullName: fullName(r),
          preTestScore: pre?.score ?? null,
          postTestScore: shown?.score ?? null,
          postTestAttempts: posts.length,
          passed: shown ? Boolean(shown.passed) : null,
        };
      })
      .sort((a, b) => byTurkish(a.groupName, b.groupName) || byTurkish(a.fullName, b.fullName));
  }

  async certificate(userId: string, participantId: string) {
    const [row] = await this.db
      .select({
        firstName: employees.firstName,
        lastName: employees.lastName,
        nationalId: employees.nationalId,
        organizationId: organizations.id,
        organizationName: organizations.name,
        trainingId: trainings.id,
        trainingName: trainings.name,
        trainerFirstName: trainers.firstName,
        trainerLastName: trainers.lastName,
        completedAt: trainingParticipants.completedAt,
      })
      .from(trainingParticipants)
      .innerJoin(trainingGroups, eq(trainingGroups.id, trainingParticipants.groupId))
      .innerJoin(organizations, eq(organizations.id, trainingGroups.organizationId))
      .innerJoin(trainings, eq(trainings.id, trainingGroups.trainingId))
      .leftJoin(trainers, eq(trainers.id, trainingGroups.trainerId))
      .innerJoin(employees, eq(employees.id, trainingParticipants.employeeId))
      .where(eq(trainingParticipants.id, participantId));
    if (!row) throw new NotFoundException('Katılımcı bulunamadı');
    if (!row.completedAt) throw new BadRequestException('Katılımcı eğitimi başarıyla tamamlamadı; sertifika oluşturulamaz');
    const topics = await this.db
      .select({ title: trainingTopics.title })
      .from(trainingTopics)
      .where(eq(trainingTopics.trainingId, row.trainingId))
      .orderBy(asc(trainingTopics.sortOrder));
    const pdf = await certificatePdf({
      fullName: fullName(row),
      nationalId: row.nationalId,
      organizationName: row.organizationName,
      trainingName: row.trainingName,
      topics: topics.map((t) => t.title),
      trainerName: row.trainerFirstName ? `${row.trainerFirstName} ${row.trainerLastName}` : null,
      completedAt: row.completedAt,
    });
    await this.audit.record({
      action: 'training.certificate_created',
      organizationId: row.organizationId,
      userId,
      entityType: 'training_participant',
      entityId: participantId,
    });
    return { pdf, fileName: `Sertifika - ${fullName(row)}.pdf` };
  }

  private async insertParticipants(groupId: string, orgId: string, employeeIds: string[]) {
    const unique = [...new Set(employeeIds)];
    const found = await this.db
      .select({ id: employees.id })
      .from(employees)
      .where(and(eq(employees.organizationId, orgId), inArray(employees.id, unique)));
    if (found.length !== unique.length) throw new BadRequestException('Seçilen çalışanlardan bazıları bu kuruluşa ait değil');
    const inserted = await this.db
      .insert(trainingParticipants)
      .values(unique.map((employeeId) => ({ groupId, employeeId })))
      .onConflictDoNothing()
      .returning({ id: trainingParticipants.id });
    return inserted.length;
  }

  private async find(id: string) {
    const [row] = await this.db.select().from(trainingGroups).where(eq(trainingGroups.id, id));
    if (!row) throw new NotFoundException('Eğitim grubu bulunamadı');
    return row;
  }
}
