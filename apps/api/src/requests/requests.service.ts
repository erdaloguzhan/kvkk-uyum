import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  DSR_ATTACHMENT_MAX_BYTES,
  DSR_ATTACHMENT_MAX_FILES,
  DSR_ATTACHMENT_MIME_TYPES,
  DSR_CHANNELS,
  DSR_LEGAL_DAYS,
  DSR_OUTCOMES,
  DSR_RELATIONSHIPS,
  DSR_REQUEST_ITEMS,
  DSR_STATUSES,
  DSR_TARGET_DAYS,
  DsrAnswerMethod,
  DsrChannel,
  DsrEventKind,
  DsrOutcome,
  DsrRelationship,
  DsrRequestItem,
  DsrResponseMethod,
  DsrStatus,
  dsrNumber,
  PERMISSIONS,
} from '@kvkk/shared';
import { and, asc, desc, eq, getTableColumns, gte, lte, sql, SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { AuditService } from '../audit/audit.service';
import { MailerService } from '../auth/mailer.service';
import { AppConfig, CONFIG } from '../config';
import { Database, InjectDb } from '../db/db.module';
import {
  dataSubjectRequestEvents,
  dataSubjectRequestFiles,
  dataSubjectRequests,
  memberships,
  organizations,
  roles,
  tasks,
  users,
} from '../db/schema';
import { addDays, dateIn, daysBetween, formatDate, IsoDate } from '../workflow/dates';
import { NotificationsService } from '../workflow/notifications.service';
import { requestPdf } from './request-pdf';

type RequestRow = typeof dataSubjectRequests.$inferSelect;

export interface UploadedFile {
  fileName: string;
  mimeType: string;
  content: Buffer;
}

export interface ApplicantInput {
  fullName: string;
  nationalId: string | null;
  birthDate: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  relationship: DsrRelationship;
  relationshipDetail: string | null;
  responseMethod: DsrResponseMethod;
  items: DsrRequestItem[];
  description: string | null;
}

export interface ManualInput extends ApplicantInput {
  channel: Exclude<DsrChannel, 'web_form'>;
  receivedOn: IsoDate;
}

export interface AnswerInput {
  answeredOn: IsoDate;
  outcome: DsrOutcome;
  method: DsrAnswerMethod;
  summary: string;
}

export interface RequestFilter {
  status?: DsrStatus;
  q?: string;
  from?: IsoDate;
  to?: IsoDate;
  overdue?: boolean;
}

interface Client {
  ip: string | null;
  userAgent: string | null;
}

/** Bir kuruluşa online formdan bir günde gelebilecek en fazla başvuru (form kötüye kullanılırsa sel olmasın). */
export const DAILY_WEB_FORM_LIMIT = 50;

/** Dosyanın gerçek türü ilk baytlarından kontrol edilir (uzantıya/beyana güvenilmez). */
const SIGNATURES: Record<(typeof DSR_ATTACHMENT_MIME_TYPES)[number], (b: Buffer) => boolean> = {
  'application/pdf': (b) => b.subarray(0, 5).toString('latin1') === '%PDF-',
  'image/png': (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
};

const creator = alias(users, 'creator');
const recorder = alias(users, 'recorder');
const assignee = alias(users, 'assignee');

const maskNationalId = (v: string | null) => (v ? `${v.slice(0, 3)}******${v.slice(-2)}` : null);

/**
 * İlgili kişi başvuruları (FRM-010 / PRS-010). Online formdan gelen veya Sorumlunun girdiği başvuru,
 * kuruluşun KVKK Sorumlusuna görev olarak düşer. Cevap süresi başvurunun alındığı günden sayılır:
 * kurum içi hedef `DSR_TARGET_DAYS`, yasal son gün `DSR_LEGAL_DAYS`. Ek bilgi beklenirken süre durur.
 */
@Injectable()
export class RequestsService {
  private readonly logger = new Logger(RequestsService.name);

  constructor(
    @InjectDb() private readonly db: Database,
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly audit: AuditService,
    private readonly mailer: MailerService,
    private readonly notifications: NotificationsService,
  ) {}

  // -------------------------------------------------------------------------------------------
  // Herkese açık form
  // -------------------------------------------------------------------------------------------

  /** Formun başlığında gösterilecek kuruluş bilgisi. Kod yanlışsa veya form kapalıysa bulunamadı döner. */
  async publicForm(key: string) {
    const org = await this.findFormOrg(key);
    return { organizationName: org.name, website: org.website };
  }

  async submitPublic(key: string, input: ApplicantInput, files: UploadedFile[], client: Client, now = new Date()) {
    const org = await this.findFormOrg(key);
    const checked = this.checkFiles(files);
    const [{ today }] = await this.db
      .select({ today: sql<number>`count(*)::int` })
      .from(dataSubjectRequests)
      .where(
        and(
          eq(dataSubjectRequests.organizationId, org.id),
          eq(dataSubjectRequests.channel, 'web_form'),
          gte(dataSubjectRequests.createdAt, new Date(now.getTime() - 24 * 60 * 60 * 1000)),
        ),
      );
    if (today >= DAILY_WEB_FORM_LIMIT) {
      this.logger.warn(`Başvuru formu günlük sınırı aşıldı: ${org.id}`);
      throw new ServiceUnavailableException(
        'Şu anda başvuru alınamıyor. Lütfen daha sonra tekrar deneyin veya başvurunuzu yazılı olarak iletin.',
      );
    }
    const request = await this.insert(org.id, null, { ...input, channel: 'web_form', receivedAt: now, ...client }, checked, now);
    await this.audit.record({
      action: 'data_subject_request.submitted',
      organizationId: org.id,
      entityType: 'data_subject_request',
      entityId: request.id,
      metadata: { number: request.number, channel: 'web_form', files: checked.length },
    });
    if (request.email) {
      // E-postada başvuranın yazdığı hiçbir metin yer almaz (form başkası adına kötüye kullanılamasın).
      await this.mailer.send({
        to: request.email,
        subject: `Kişisel veri başvurunuz alındı (${dsrNumber(request.number)})`,
        text:
          `Sayın Başvuru Sahibi,\n\n` +
          `${org.name} kuruluşuna yaptığınız kişisel veri başvurusu ${formatDate(dateIn(now))} tarihinde alınmıştır.\n\n` +
          `Başvuru numaranız: ${dsrNumber(request.number)}\n\n` +
          `Başvurunuz 6698 sayılı Kanun'un 13. maddesi uyarınca değerlendirilerek en geç ${DSR_LEGAL_DAYS} gün içinde ` +
          `seçtiğiniz yöntemle cevaplanacaktır. Kimliğinizi teyit etmek için sizinle iletişime geçilebilir.\n\n` +
          `Bu başvuruyu siz yapmadıysanız ${org.name} ile iletişime geçiniz.\n`,
      });
    }
    return { number: dsrNumber(request.number), receivedAt: request.receivedAt, organizationName: org.name };
  }

  // -------------------------------------------------------------------------------------------
  // Kuruluş paneli
  // -------------------------------------------------------------------------------------------

  async createManual(orgId: string, userId: string, input: ManualInput, files: UploadedFile[], now = new Date()) {
    const today = dateIn(now);
    if (input.receivedOn > today) throw new BadRequestException('Başvuru tarihi ileri bir gün olamaz');
    if (daysBetween(input.receivedOn, today) > 365) throw new BadRequestException('Başvuru tarihi bir yıldan eski olamaz');
    const checked = this.checkFiles(files);
    const { receivedOn, ...rest } = input;
    // Gün başı Türkiye saatiyle (UTC+3) kaydedilir; süreler gün olarak hesaplanır.
    const receivedAt = receivedOn === today ? now : new Date(`${receivedOn}T09:00:00+03:00`);
    const request = await this.insert(orgId, userId, { ...rest, receivedAt, ip: null, userAgent: null }, checked, now);
    await this.audit.record({
      action: 'data_subject_request.created',
      organizationId: orgId,
      userId,
      entityType: 'data_subject_request',
      entityId: request.id,
      metadata: { number: request.number, channel: input.channel, files: checked.length },
    });
    return this.get(orgId, request.id, now);
  }

  async list(orgId: string, filter: RequestFilter = {}, now = new Date()) {
    const conditions: SQL[] = [eq(dataSubjectRequests.organizationId, orgId)];
    if (filter.status) conditions.push(eq(dataSubjectRequests.status, filter.status));
    if (filter.from) conditions.push(gte(dataSubjectRequests.receivedAt, startOfDay(filter.from)));
    if (filter.to) conditions.push(lte(dataSubjectRequests.receivedAt, endOfDay(filter.to)));
    const today = dateIn(now);
    let rows = await this.db
      .select({ request: getTableColumns(dataSubjectRequests), assignee: { id: assignee.id, fullName: assignee.fullName } })
      .from(dataSubjectRequests)
      .leftJoin(tasks, eq(tasks.id, dataSubjectRequests.taskId))
      .leftJoin(assignee, eq(assignee.id, tasks.assigneeId))
      .where(and(...conditions))
      .orderBy(desc(dataSubjectRequests.receivedAt));
    if (filter.q) {
      const q = filter.q.toLocaleLowerCase('tr-TR');
      rows = rows.filter(({ request: r }) =>
        [r.fullName, r.email, r.phone, dsrNumber(r.number)].some((v) => v?.toLocaleLowerCase('tr-TR').includes(q)),
      );
    }
    const items = rows.map(({ request, assignee: a }) => ({
      ...this.summaryView(request, today),
      assignee: a?.id ? a : null,
    }));
    return filter.overdue ? items.filter((r) => r.overdue) : items;
  }

  async get(orgId: string, id: string, now = new Date()) {
    const [row] = await this.db
      .select({
        request: getTableColumns(dataSubjectRequests),
        creator: { id: creator.id, fullName: creator.fullName },
        recorder: { id: recorder.id, fullName: recorder.fullName },
      })
      .from(dataSubjectRequests)
      .leftJoin(creator, eq(creator.id, dataSubjectRequests.createdBy))
      .leftJoin(recorder, eq(recorder.id, dataSubjectRequests.answerRecordedBy))
      .where(and(eq(dataSubjectRequests.id, id), eq(dataSubjectRequests.organizationId, orgId)));
    if (!row) throw new NotFoundException('Başvuru bulunamadı');
    const { request } = row;
    const [files, events, task] = await Promise.all([
      this.db
        .select({
          id: dataSubjectRequestFiles.id,
          kind: dataSubjectRequestFiles.kind,
          fileName: dataSubjectRequestFiles.fileName,
          mimeType: dataSubjectRequestFiles.mimeType,
          size: dataSubjectRequestFiles.size,
          createdAt: dataSubjectRequestFiles.createdAt,
        })
        .from(dataSubjectRequestFiles)
        .where(eq(dataSubjectRequestFiles.requestId, id))
        .orderBy(asc(dataSubjectRequestFiles.createdAt)),
      this.db
        .select({
          id: dataSubjectRequestEvents.id,
          kind: dataSubjectRequestEvents.kind,
          note: dataSubjectRequestEvents.note,
          createdAt: dataSubjectRequestEvents.createdAt,
          user: { id: users.id, fullName: users.fullName },
        })
        .from(dataSubjectRequestEvents)
        .leftJoin(users, eq(users.id, dataSubjectRequestEvents.userId))
        .where(eq(dataSubjectRequestEvents.requestId, id))
        .orderBy(asc(dataSubjectRequestEvents.createdAt)),
      request.taskId
        ? this.db
            .select({ id: tasks.id, status: tasks.status, dueDate: tasks.dueDate, assignee: { id: users.id, fullName: users.fullName } })
            .from(tasks)
            .innerJoin(users, eq(users.id, tasks.assigneeId))
            .where(eq(tasks.id, request.taskId))
            .then((r) => r[0] ?? null)
        : null,
    ]);
    return {
      ...this.summaryView(request, dateIn(now)),
      nationalId: request.nationalId,
      ip: request.ip,
      userAgent: request.userAgent,
      createdBy: row.creator?.id ? row.creator : null,
      answerRecordedBy: row.recorder?.id ? row.recorder : null,
      task,
      files,
      events: events.map((e) => ({ ...e, user: e.user?.id ? e.user : null })),
    };
  }

  /** Durum değişikliği. "Ek bilgi bekleniyor" süreyi durdurur, bu durumdan çıkmak süreyi kaldığı yerden başlatır. */
  async setStatus(orgId: string, userId: string, id: string, status: Exclude<DsrStatus, 'answered'>, note: string | null, now = new Date()) {
    const before = await this.find(orgId, id);
    if (before.status === 'answered') throw new ConflictException('Cevaplanmış başvurunun durumu değiştirilemez');
    if (before.status === status) return this.get(orgId, id, now);
    const today = dateIn(now);
    await this.db.transaction(async (tx) => {
      const changes: Partial<RequestRow> = { status, updatedAt: now };
      let kind: DsrEventKind = 'status_changed';
      if (status === 'awaiting_info') {
        changes.pausedOn = today;
        kind = 'info_requested';
      } else if (before.status === 'awaiting_info') {
        Object.assign(changes, resumeChanges(before, today));
        kind = 'info_received';
        if (before.taskId && changes.targetDate) {
          await tx.update(tasks).set({ dueDate: changes.targetDate, updatedAt: now }).where(eq(tasks.id, before.taskId));
        }
      }
      await tx.update(dataSubjectRequests).set(changes).where(eq(dataSubjectRequests.id, id));
      await tx.insert(dataSubjectRequestEvents).values({
        requestId: id,
        kind,
        userId,
        note: kind === 'status_changed' ? joinNote(`${DSR_STATUSES[before.status]} → ${DSR_STATUSES[status]}`, note) : note,
      });
    });
    await this.audit.record({
      action: 'data_subject_request.status_changed',
      organizationId: orgId,
      userId,
      entityType: 'data_subject_request',
      entityId: id,
      metadata: { from: before.status, to: status },
    });
    return this.get(orgId, id, now);
  }

  /** Açık başvurunun görevini başka bir kullanıcıya aktarır; görev yoksa (kuruluşta yetkili kimse yokken gelmişse) açar. */
  async reassign(orgId: string, userId: string, id: string, assigneeId: string, now = new Date()) {
    const request = await this.find(orgId, id);
    if (request.status === 'answered') throw new ConflictException('Cevaplanmış başvurunun sorumlusu değiştirilemez');
    const candidate = (await this.assigneeCandidates(orgId)).find((c) => c.id === assigneeId);
    if (!candidate) throw new BadRequestException('Seçilen kişi bu kuruluşta başvuruları yönetme yetkisine sahip aktif bir kullanıcı değil');
    const [current] = request.taskId
      ? await this.db.select({ assigneeId: tasks.assigneeId }).from(tasks).where(eq(tasks.id, request.taskId))
      : [];
    if (current?.assigneeId === assigneeId) return this.get(orgId, id, now);
    const taskId = await this.db.transaction(async (tx) => {
      let taskId = request.taskId;
      if (taskId) {
        await tx.update(tasks).set({ assigneeId, updatedAt: now }).where(eq(tasks.id, taskId));
      } else {
        const [task] = await tx.insert(tasks).values(this.taskValues(orgId, request, assigneeId, userId)).returning({ id: tasks.id });
        taskId = task.id;
        await tx.update(dataSubjectRequests).set({ taskId, updatedAt: now }).where(eq(dataSubjectRequests.id, id));
      }
      await tx.insert(dataSubjectRequestEvents).values({ requestId: id, kind: 'reassigned', userId, note: candidate.fullName });
      return taskId;
    });
    await this.audit.record({
      action: 'data_subject_request.reassigned',
      organizationId: orgId,
      userId,
      entityType: 'data_subject_request',
      entityId: id,
      metadata: { assigneeId, from: current?.assigneeId ?? null },
    });
    if (assigneeId !== userId) await this.notifyAssignee(orgId, assigneeId, request, taskId);
    return this.get(orgId, id, now);
  }

  async addNote(orgId: string, userId: string, id: string, note: string, now = new Date()) {
    await this.find(orgId, id);
    await this.db.insert(dataSubjectRequestEvents).values({ requestId: id, kind: 'note', userId, note });
    await this.audit.record({
      action: 'data_subject_request.note_added',
      organizationId: orgId,
      userId,
      entityType: 'data_subject_request',
      entityId: id,
    });
    return this.get(orgId, id, now);
  }

  async addFiles(orgId: string, userId: string, id: string, files: UploadedFile[], now = new Date()) {
    await this.find(orgId, id);
    if (files.length === 0) throw new BadRequestException('Dosya seçilmedi');
    const checked = this.checkFiles(files);
    await this.db.transaction(async (tx) => {
      await this.insertFiles(tx, id, 'other', checked, userId);
      await tx
        .insert(dataSubjectRequestEvents)
        .values({ requestId: id, kind: 'file_added', userId, note: checked.map((f) => f.fileName).join(', ') });
    });
    await this.audit.record({
      action: 'data_subject_request.files_added',
      organizationId: orgId,
      userId,
      entityType: 'data_subject_request',
      entityId: id,
      metadata: { files: checked.length },
    });
    return this.get(orgId, id, now);
  }

  /**
   * Cevabı kaydeder: cevap günü, sonuç (kabul/kısmen/ret), bildirim yolu ve açıklama; isteğe bağlı cevap yazısı.
   * İlk kayıtta başvuru "Cevaplandı" olur ve görev kapanır. Cevaplanmış başvuruda bilgiler güncellenebilir.
   */
  async answer(orgId: string, userId: string, id: string, input: AnswerInput, files: UploadedFile[], now = new Date()) {
    const before = await this.find(orgId, id);
    const today = dateIn(now);
    if (input.answeredOn > today) throw new BadRequestException('Cevap tarihi ileri bir gün olamaz');
    if (input.answeredOn < dateIn(before.receivedAt)) {
      throw new BadRequestException('Cevap tarihi başvuru tarihinden önce olamaz');
    }
    const checked = this.checkFiles(files);
    const first = before.status !== 'answered';
    await this.db.transaction(async (tx) => {
      await tx
        .update(dataSubjectRequests)
        .set({
          ...(before.status === 'awaiting_info' ? resumeChanges(before, input.answeredOn) : {}),
          status: 'answered',
          answeredOn: input.answeredOn,
          answerOutcome: input.outcome,
          answerMethod: input.method,
          answerSummary: input.summary,
          answerRecordedAt: now,
          answerRecordedBy: userId,
          updatedAt: now,
        })
        .where(eq(dataSubjectRequests.id, id));
      await this.insertFiles(tx, id, 'response', checked, userId);
      await tx.insert(dataSubjectRequestEvents).values({
        requestId: id,
        kind: first ? 'answered' : 'answer_updated',
        userId,
        note: `${DSR_OUTCOMES[input.outcome]} · ${formatDate(input.answeredOn)}`,
      });
      if (first && before.taskId) {
        await tx
          .update(tasks)
          .set({ status: 'done', completedAt: now, completedBy: userId, completionNote: 'Başvuru cevaplandı', updatedAt: now })
          .where(and(eq(tasks.id, before.taskId), eq(tasks.status, 'open')));
      }
    });
    await this.audit.record({
      action: first ? 'data_subject_request.answered' : 'data_subject_request.answer_updated',
      organizationId: orgId,
      userId,
      entityType: 'data_subject_request',
      entityId: id,
      metadata: { outcome: input.outcome, method: input.method, answeredOn: input.answeredOn, files: checked.length },
    });
    return this.get(orgId, id, now);
  }

  async file(orgId: string, id: string, fileId: string) {
    await this.find(orgId, id);
    const [file] = await this.db
      .select()
      .from(dataSubjectRequestFiles)
      .where(and(eq(dataSubjectRequestFiles.id, fileId), eq(dataSubjectRequestFiles.requestId, id)));
    if (!file) throw new NotFoundException('Dosya bulunamadı');
    return file;
  }

  /** Başvurunun FRM-010 düzeninde PDF'i (cevaplandıysa cevap bilgisiyle). */
  async pdf(orgId: string, id: string) {
    const request = await this.get(orgId, id);
    const [org] = await this.db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, orgId));
    const content = await requestPdf({ ...request, organizationName: org.name });
    return { fileName: `${dsrNumber(request.number)} Veri Sahibi Başvuru Formu.pdf`, content };
  }

  /** Rapor: seçilen dönemde (başvuru tarihine göre) alınan başvuruların dağılımı ve cevap süreleri. */
  async report(orgId: string, range: { from?: IsoDate; to?: IsoDate }, now = new Date()) {
    const today = dateIn(now);
    const conditions: SQL[] = [eq(dataSubjectRequests.organizationId, orgId)];
    if (range.from) conditions.push(gte(dataSubjectRequests.receivedAt, startOfDay(range.from)));
    if (range.to) conditions.push(lte(dataSubjectRequests.receivedAt, endOfDay(range.to)));
    const rows = (await this.db.select().from(dataSubjectRequests).where(and(...conditions))).map((r) =>
      this.summaryView(r, today),
    );
    const count = <K extends string>(labels: Record<K, unknown>, pick: (r: (typeof rows)[number]) => K | null) =>
      (Object.keys(labels) as K[]).map((key) => ({ key, count: rows.filter((r) => pick(r) === key).length }));
    const answered = rows.filter((r) => r.status === 'answered' && r.responseDays !== null);
    const months = new Map<string, { month: string; received: number; answered: number }>();
    for (const r of rows) {
      const month = dateIn(r.receivedAt).slice(0, 7);
      const m = months.get(month) ?? { month, received: 0, answered: 0 };
      m.received++;
      if (r.status === 'answered') m.answered++;
      months.set(month, m);
    }
    return {
      from: range.from ?? null,
      to: range.to ?? null,
      targetDays: DSR_TARGET_DAYS,
      legalDays: DSR_LEGAL_DAYS,
      total: rows.length,
      open: rows.filter((r) => r.status !== 'answered').length,
      answered: answered.length,
      averageResponseDays: answered.length
        ? Math.round((answered.reduce((s, r) => s + r.responseDays!, 0) / answered.length) * 10) / 10
        : null,
      answeredWithinTarget: answered.filter((r) => r.responseDays! <= DSR_TARGET_DAYS).length,
      answeredWithinLegal: answered.filter((r) => r.responseDays! <= DSR_LEGAL_DAYS).length,
      answeredLate: answered.filter((r) => r.responseDays! > DSR_LEGAL_DAYS).length,
      openPastTarget: rows.filter((r) => r.overdue).length,
      openPastLegal: rows.filter((r) => r.legalOverdue).length,
      openDueSoon: rows.filter((r) => r.status !== 'answered' && r.status !== 'awaiting_info' && !r.overdue && r.daysToTarget! <= 5).length,
      byStatus: count(DSR_STATUSES, (r) => r.status),
      byOutcome: count(DSR_OUTCOMES, (r) => r.answerOutcome),
      byChannel: count(DSR_CHANNELS, (r) => r.channel),
      byRelationship: count(DSR_RELATIONSHIPS, (r) => r.relationship),
      byItem: DSR_REQUEST_ITEMS.map((i) => ({ no: i.no, count: rows.filter((r) => r.items.some((x) => x.no === i.no)).length })),
      byMonth: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)),
    };
  }

  // -------------------------------------------------------------------------------------------
  // Form ayarları
  // -------------------------------------------------------------------------------------------

  async formSettings(orgId: string) {
    const [org] = await this.db
      .select({ key: organizations.requestFormKey, enabled: organizations.requestFormEnabled, assigneeId: organizations.requestAssigneeId })
      .from(organizations)
      .where(eq(organizations.id, orgId));
    if (!org) throw new NotFoundException('Kuruluş bulunamadı');
    const candidates = await this.assigneeCandidates(orgId);
    const chosen = candidates.find((c) => c.id === org.assigneeId) ?? null;
    const url = `${this.config.appUrl}/basvuru/${org.key}`;
    return {
      enabled: org.enabled,
      key: org.key,
      url,
      embedCode: `<iframe src="${url}?gomulu=1" title="Kişisel Veri Başvuru Formu" style="width:100%;min-height:1600px;border:0" loading="lazy"></iframe>`,
      assignee: chosen,
      /** Seçim yapılmadıysa (veya seçilen kişi artık uygun değilse) yeni başvurunun düşeceği kişi. */
      effectiveAssignee: chosen ?? candidates[0] ?? null,
      candidates,
    };
  }

  async updateFormSettings(orgId: string, userId: string, input: { enabled?: boolean; assigneeId?: string | null }) {
    if (input.assigneeId) {
      const candidates = await this.assigneeCandidates(orgId);
      if (!candidates.some((c) => c.id === input.assigneeId)) {
        throw new BadRequestException('Seçilen kişi bu kuruluşta başvuruları yönetme yetkisine sahip aktif bir kullanıcı değil');
      }
    }
    const changes: Partial<typeof organizations.$inferInsert> = {};
    if (input.enabled !== undefined) changes.requestFormEnabled = input.enabled;
    if (input.assigneeId !== undefined) changes.requestAssigneeId = input.assigneeId;
    if (Object.keys(changes).length) await this.db.update(organizations).set(changes).where(eq(organizations.id, orgId));
    if (input.enabled !== undefined) {
      await this.audit.record({
        action: input.enabled ? 'data_subject_request.form_enabled' : 'data_subject_request.form_disabled',
        organizationId: orgId,
        userId,
        entityType: 'organization',
        entityId: orgId,
      });
    }
    if (input.assigneeId !== undefined) {
      await this.audit.record({
        action: 'data_subject_request.default_assignee_changed',
        organizationId: orgId,
        userId,
        entityType: 'organization',
        entityId: orgId,
        metadata: { assigneeId: input.assigneeId },
      });
    }
    return this.formSettings(orgId);
  }

  /** Yeni form adresi üretir; eski bağlantı ve web sitesine gömülü eski kod çalışmaz olur. */
  async regenerateFormKey(orgId: string, userId: string) {
    await this.db
      .update(organizations)
      .set({ requestFormKey: sql`substr(md5(gen_random_uuid()::text), 1, 16)` })
      .where(eq(organizations.id, orgId));
    await this.audit.record({
      action: 'data_subject_request.form_key_regenerated',
      organizationId: orgId,
      userId,
      entityType: 'organization',
      entityId: orgId,
    });
    return this.formSettings(orgId);
  }

  // -------------------------------------------------------------------------------------------

  private summaryView(r: RequestRow, today: IsoDate) {
    const open = r.status !== 'answered';
    const paused = r.status === 'awaiting_info';
    const daysToTarget = open ? daysBetween(today, r.targetDate) : null;
    const daysToLegal = open ? daysBetween(today, r.legalDueDate) : null;
    return {
      id: r.id,
      number: r.number,
      code: dsrNumber(r.number),
      channel: r.channel,
      fullName: r.fullName,
      nationalIdMasked: maskNationalId(r.nationalId),
      birthDate: r.birthDate,
      phone: r.phone,
      email: r.email,
      address: r.address,
      relationship: r.relationship,
      relationshipDetail: r.relationshipDetail,
      responseMethod: r.responseMethod,
      items: r.items,
      description: r.description,
      status: r.status,
      receivedAt: r.receivedAt,
      targetDate: r.targetDate,
      legalDueDate: r.legalDueDate,
      pausedOn: r.pausedOn,
      pausedDays: r.pausedDays,
      daysToTarget,
      daysToLegal,
      overdue: open && !paused && daysToTarget! < 0,
      legalOverdue: open && !paused && daysToLegal! < 0,
      answeredOn: r.answeredOn,
      answerOutcome: r.answerOutcome,
      answerMethod: r.answerMethod,
      answerSummary: r.answerSummary,
      answerRecordedAt: r.answerRecordedAt,
      /** Cevap süresi (gün): başvuru gününden cevap gününe, ek bilgi beklenen günler hariç. */
      responseDays: r.answeredOn ? Math.max(0, daysBetween(dateIn(r.receivedAt), r.answeredOn) - r.pausedDays) : null,
      createdAt: r.createdAt,
    };
  }

  private async insert(
    orgId: string,
    userId: string | null,
    input: ApplicantInput & { channel: DsrChannel; receivedAt: Date } & Client,
    files: UploadedFile[],
    now: Date,
  ) {
    const receivedOn = dateIn(input.receivedAt);
    const targetDate = addDays(receivedOn, DSR_TARGET_DAYS);
    const legalDueDate = addDays(receivedOn, DSR_LEGAL_DAYS);
    const officer = await this.findOfficer(orgId);
    const request = await this.db.transaction(async (tx) => {
      // Kuruluş içinde sıralı numara: aynı anda gelen iki başvuru aynı numarayı almasın.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`dsr:${orgId}`}))`);
      const [{ next }] = await tx
        .select({ next: sql<number>`coalesce(max(${dataSubjectRequests.number}), 0)::int + 1` })
        .from(dataSubjectRequests)
        .where(eq(dataSubjectRequests.organizationId, orgId));
      const [created] = await tx
        .insert(dataSubjectRequests)
        .values({
          organizationId: orgId,
          number: next,
          channel: input.channel,
          fullName: input.fullName,
          nationalId: input.nationalId,
          birthDate: input.birthDate,
          phone: input.phone,
          email: input.email,
          address: input.address,
          relationship: input.relationship,
          relationshipDetail: input.relationshipDetail,
          responseMethod: input.responseMethod,
          items: input.items,
          description: input.description,
          receivedAt: input.receivedAt,
          targetDate,
          legalDueDate,
          ip: input.ip,
          userAgent: input.userAgent,
          createdBy: userId,
        })
        .returning();
      await this.insertFiles(tx, created.id, 'applicant', files, userId);
      await tx.insert(dataSubjectRequestEvents).values({
        requestId: created.id,
        kind: 'received',
        userId,
        note: DSR_CHANNELS[input.channel],
      });
      if (!officer) return created;
      const [task] = await tx
        .insert(tasks)
        .values(this.taskValues(orgId, created, officer.id, userId))
        .returning();
      const [withTask] = await tx
        .update(dataSubjectRequests)
        .set({ taskId: task.id })
        .where(eq(dataSubjectRequests.id, created.id))
        .returning();
      return withTask;
    });
    if (!officer) {
      this.logger.warn(`Başvuru ${request.id}: kuruluşta başvuruları yönetebilecek aktif kullanıcı yok, görev açılamadı`);
    } else if (officer.id !== userId) {
      await this.notifyAssignee(orgId, officer.id, request, request.taskId);
    }
    return request;
  }

  private taskValues(orgId: string, r: RequestRow, assigneeId: string, userId: string | null): typeof tasks.$inferInsert {
    const receivedOn = dateIn(r.receivedAt);
    return {
      organizationId: orgId,
      type: 'data_subject_request',
      title: `İlgili kişi başvurusu ${dsrNumber(r.number)} değerlendirilip cevaplanmalı`,
      description:
        `Başvuru ${formatDate(receivedOn)} tarihinde alındı (${DSR_CHANNELS[r.channel]}). ` +
        `Kurum içi cevap hedefi ${formatDate(r.targetDate)}, yasal son gün ${formatDate(r.legalDueDate)}. ` +
        `Cevap verildiğinde başvuru sayfasından cevap bilgisi kaydedilir; görev kendiliğinden kapanır.`,
      assigneeId,
      dueDate: r.targetDate,
      reminderDays: [7, 1],
      entityType: 'data_subject_request',
      entityId: r.id,
      createdBy: userId,
    };
  }

  /** Bildirim ve e-postada başvuranın kişisel verisi yer almaz; ayrıntı sistemde görülür. */
  private async notifyAssignee(orgId: string, assigneeId: string, r: RequestRow, taskId: string | null) {
    await this.notifications.notify({
      organizationId: orgId,
      userId: assigneeId,
      kind: 'task_assigned',
      title: `İlgili kişi başvurusu size atandı: ${dsrNumber(r.number)}`,
      body:
        `Kuruluşunuza gelen ilgili kişi başvurusu (${DSR_CHANNELS[r.channel]}) size atandı: ${dsrNumber(r.number)}\n` +
        `Kurum içi cevap hedefi: ${formatDate(r.targetDate)}\nYasal son gün: ${formatDate(r.legalDueDate)}\n\n` +
        `${this.config.appUrl}/basvurular/${r.id}\n`,
      taskId,
    });
  }

  /**
   * Başvuruları yönetme yetkisi olan aktif üyeler, varsayılan atama sırasıyla: önce "KVKK Sorumlusu",
   * sonra "KVKK Sorumlusu + Yönetici", sonra diğerleri; aynı roldekiler arasında en eski üye önce.
   */
  private async assigneeCandidates(orgId: string) {
    const rows = await this.db
      .select({ id: users.id, fullName: users.fullName, roleKey: roles.key, roleName: roles.name, permissions: roles.permissions, since: memberships.createdAt })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .innerJoin(roles, eq(roles.id, memberships.roleId))
      .where(and(eq(memberships.organizationId, orgId), eq(memberships.status, 'active'), eq(users.isActive, true)))
      .orderBy(asc(memberships.createdAt));
    const rank = (key: string) => (key === 'kvkk_officer' ? 0 : key === 'officer_approver' ? 1 : 2);
    return rows
      .filter((r) => r.permissions.includes(PERMISSIONS.REQUESTS_MANAGE))
      .sort((a, b) => rank(a.roleKey) - rank(b.roleKey) || a.since.getTime() - b.since.getTime())
      .map((r) => ({ id: r.id, fullName: r.fullName, roleName: r.roleName }));
  }

  /** Yeni başvurunun görevini alacak kişi: form ayarlarında seçilen kişi (hâlâ uygunsa), yoksa sıradaki ilk aday. */
  private async findOfficer(orgId: string) {
    const [org] = await this.db
      .select({ assigneeId: organizations.requestAssigneeId })
      .from(organizations)
      .where(eq(organizations.id, orgId));
    const candidates = await this.assigneeCandidates(orgId);
    return candidates.find((c) => c.id === org?.assigneeId) ?? candidates[0] ?? null;
  }

  private async insertFiles(
    tx: Pick<Database, 'insert'>,
    requestId: string,
    kind: 'applicant' | 'response' | 'other',
    files: UploadedFile[],
    userId: string | null,
  ) {
    if (files.length === 0) return;
    await tx.insert(dataSubjectRequestFiles).values(
      files.map((f) => ({ requestId, kind, fileName: f.fileName, mimeType: f.mimeType, size: f.content.length, content: f.content, uploadedBy: userId })),
    );
  }

  private checkFiles(files: UploadedFile[]) {
    if (files.length > DSR_ATTACHMENT_MAX_FILES) {
      throw new BadRequestException(`En fazla ${DSR_ATTACHMENT_MAX_FILES} dosya eklenebilir`);
    }
    return files.map((f) => {
      if (f.content.length > DSR_ATTACHMENT_MAX_BYTES) throw new BadRequestException(`${f.fileName}: dosya en fazla 5 MB olabilir`);
      const mimeType = DSR_ATTACHMENT_MIME_TYPES.find((t) => SIGNATURES[t](f.content));
      if (!mimeType) throw new BadRequestException(`${f.fileName}: yalnızca PDF, JPEG veya PNG dosyası eklenebilir`);
      return { ...f, fileName: f.fileName.slice(0, 200), mimeType };
    });
  }

  private async findFormOrg(key: string) {
    const [org] = /^[0-9a-f]{16}$/.test(key)
      ? await this.db
          .select({ id: organizations.id, name: organizations.name, website: organizations.website, enabled: organizations.requestFormEnabled })
          .from(organizations)
          .where(eq(organizations.requestFormKey, key))
      : [];
    if (!org || !org.enabled) throw new NotFoundException('Başvuru formu bulunamadı');
    return org;
  }

  private async find(orgId: string, id: string) {
    const [request] = await this.db
      .select()
      .from(dataSubjectRequests)
      .where(and(eq(dataSubjectRequests.id, id), eq(dataSubjectRequests.organizationId, orgId)));
    if (!request) throw new NotFoundException('Başvuru bulunamadı');
    return request;
  }
}

/** Ek bilgi beklemesi bittiğinde: beklenen gün sayısı kadar hedef ve yasal son gün ileri alınır. */
function resumeChanges(r: RequestRow, on: IsoDate): Partial<RequestRow> {
  const days = r.pausedOn ? Math.max(0, daysBetween(r.pausedOn, on)) : 0;
  return {
    pausedOn: null,
    pausedDays: r.pausedDays + days,
    targetDate: addDays(r.targetDate, days),
    legalDueDate: addDays(r.legalDueDate, days),
  };
}

const joinNote = (a: string, b: string | null) => (b ? `${a}\n${b}` : a);
/** Türkiye saatine göre günün başı/sonu. */
const startOfDay = (d: IsoDate) => new Date(`${d}T00:00:00+03:00`);
const endOfDay = (d: IsoDate) => new Date(`${d}T23:59:59.999+03:00`);

