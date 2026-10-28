import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  DEFAULT_APPROVAL_DUE_DAYS,
  DEFAULT_REMINDER_DAYS,
  EMPTY_INCIDENT_FORM,
  INCIDENT_FIELD_LABELS,
  INCIDENT_NOTIFY_DEADLINE_HOURS,
  INCIDENT_OPEN_STATUSES,
  INCIDENT_PERSONAL_DATA_CATEGORIES,
  INCIDENT_SOURCES,
  INCIDENT_SPECIAL_DATA_CATEGORIES,
  INCIDENT_STATUSES,
  IncidentForm,
  IncidentStatus,
  PERMISSIONS,
  Permission,
} from '@kvkk/shared';
import { and, desc, eq, inArray, max } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';
import { Database, InjectDb } from '../db/db.module';
import { incidents, memberships, organizations, roles, tasks, users } from '../db/schema';
import { addDays, dateIn, IsoDate } from '../workflow/dates';
import { activeMembersWithAny, requireActiveMember } from '../workflow/members';
import { NotificationsService } from '../workflow/notifications.service';
import { buildFrm020Docx, formatDateTime } from './frm020-docx';

type IncidentRow = typeof incidents.$inferSelect;

export interface IncidentInput {
  title?: string;
  occurredAt?: Date | null;
  detectedAt?: Date;
  followUpRef?: string | null;
  form?: Partial<IncidentForm>;
}

export interface IncidentFilter {
  status?: IncidentStatus;
  q?: string;
  from?: IsoDate;
  to?: IsoDate;
}

const HOUR_MS = 60 * 60 * 1000;

const isUniqueViolation = (err: unknown) =>
  (err as { cause?: { code?: string } })?.cause?.code === '23505' || (err as { code?: string })?.code === '23505';

/** İlk bildirimde Kurula bildirim için son an (PRS-030: tespitten itibaren 72 saat). */
export const deadlineOf = (i: Pick<IncidentRow, 'notificationType' | 'detectedAt'>) =>
  i.notificationType === 'initial' ? new Date(i.detectedAt.getTime() + INCIDENT_NOTIFY_DEADLINE_HOURS * HOUR_MS) : null;

/** Listede ve kayıtta gösterilen 72 saat takibi. */
function withDeadline(i: IncidentRow, now: Date) {
  const deadline = deadlineOf(i);
  const open = INCIDENT_OPEN_STATUSES.includes(i.status);
  return {
    ...i,
    deadlineAt: deadline,
    /** Bildirim yapılmadıysa son süreye kalan saat (geçtiyse eksi). */
    hoursLeft: deadline && open ? Math.floor((deadline.getTime() - now.getTime()) / HOUR_MS) : null,
    overdue: !!deadline && open && now > deadline,
    /** Kurula bildirildiyse 72 saat içinde mi bildirildi. */
    notifiedOnTime: deadline && i.notifiedAt ? i.notifiedAt <= deadline : null,
  };
}

export type IncidentView = ReturnType<typeof withDeadline> & {
  approver: { id: string; fullName: string } | null;
  createdByUser: { id: string; fullName: string } | null;
  decidedByUser: { id: string; fullName: string } | null;
};

const MANAGE_OR_APPROVE: Permission[] = [PERMISSIONS.INCIDENTS_MANAGE, PERMISSIONS.INCIDENTS_APPROVE];

/**
 * Veri ihlali olay yönetimi (PRS-030). Akış: Sorumlu kaydı FRM-020 alanlarıyla doldurur → Yöneticinin onayına
 * gönderir → Yönetici onaylar (veya gerekçeyle geri çevirir) → kayıt "Kurula bildirildi" ya da gerekçeyle
 * "bildirim gerekmedi" olarak kapatılır. Kayıt yalnızca hazırlanırken değiştirilebilir.
 */
@Injectable()
export class IncidentsService {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Yeni kaydın A bölümü: kuruluş bilgileri ve kaydı açan kişi. */
  async formDefaults(orgId: string, userId: string): Promise<Partial<IncidentForm>> {
    const [org] = await this.db
      .select({ name: organizations.name, address: organizations.address })
      .from(organizations)
      .where(eq(organizations.id, orgId));
    const [me] = await this.db
      .select({ fullName: users.fullName, email: users.email, phone: users.phone, role: roles.name })
      .from(users)
      .leftJoin(memberships, and(eq(memberships.userId, users.id), eq(memberships.organizationId, orgId)))
      .leftJoin(roles, eq(roles.id, memberships.roleId))
      .where(eq(users.id, userId));
    return {
      controllerName: org?.name ?? null,
      controllerAddress: org?.address ?? null,
      preparerName: me?.fullName ?? null,
      preparerTitle: me?.role ?? null,
      preparerEmail: me?.email ?? null,
      preparerPhone: me?.phone ?? null,
    };
  }

  async list(orgId: string, filter: IncidentFilter = {}, now = new Date()) {
    let rows = await this.db
      .select()
      .from(incidents)
      .where(and(eq(incidents.organizationId, orgId), filter.status ? eq(incidents.status, filter.status) : undefined))
      .orderBy(desc(incidents.detectedAt));
    rows = rows.filter((i) => inRange(i.detectedAt, filter.from, filter.to));
    if (filter.q) {
      const q = filter.q.toLocaleLowerCase('tr-TR');
      rows = rows.filter((i) =>
        [i.title, i.form.description, String(i.number)].some((v) => v?.toLocaleLowerCase('tr-TR').includes(q)),
      );
    }
    return this.views(rows, now);
  }

  async get(orgId: string, id: string, now = new Date()) {
    const [view] = await this.views([await this.find(orgId, id)], now);
    const related = await this.db
      .select({ id: incidents.id, number: incidents.number, title: incidents.title, notificationType: incidents.notificationType, status: incidents.status })
      .from(incidents)
      .where(and(eq(incidents.organizationId, orgId), eq(incidents.parentId, view.parentId ?? view.id)));
    const [parent] = view.parentId
      ? await this.db
          .select({ id: incidents.id, number: incidents.number, title: incidents.title })
          .from(incidents)
          .where(eq(incidents.id, view.parentId))
      : [];
    return { ...view, parent: parent ?? null, followUps: related.filter((r) => r.id !== view.id) };
  }

  async create(orgId: string, userId: string, input: IncidentInput & { title: string; detectedAt: Date }, now = new Date()) {
    this.checkDates(input.occurredAt ?? null, input.detectedAt, now);
    const defaults = await this.formDefaults(orgId, userId);
    const given = input.form ?? {};
    const form: IncidentForm = { ...EMPTY_INCIDENT_FORM, ...given };
    for (const [k, v] of Object.entries(defaults) as [keyof IncidentForm, string | null][]) {
      if (form[k] === null || form[k] === undefined) (form as unknown as Record<string, unknown>)[k] = v;
    }
    const incident = await this.insertNumbered(orgId, {
      title: input.title,
      occurredAt: input.occurredAt ?? null,
      detectedAt: input.detectedAt,
      followUpRef: input.followUpRef ?? null,
      form,
      createdBy: userId,
      updatedBy: userId,
    });
    await this.audit.record({
      action: 'incident.created',
      organizationId: orgId,
      userId,
      entityType: 'incident',
      entityId: incident.id,
      metadata: { number: incident.number, notificationType: incident.notificationType },
    });
    await this.notifyTeam(orgId, userId, incident, {
      kind: 'incident_recorded',
      title: `Veri ihlali kaydı açıldı: İhlal #${incident.number}`,
      body:
        `Kuruluşunuzda yeni bir veri ihlali kaydı açıldı: İhlal #${incident.number} ${incident.title}\n` +
        `Tespit: ${formatDateTime(incident.detectedAt)}\n` +
        `Kurula bildirim için son süre: ${formatDateTime(deadlineOf(incident))} (tespitten itibaren ${INCIDENT_NOTIFY_DEADLINE_HOURS} saat)\n`,
    });
    return this.get(orgId, incident.id, now);
  }

  async update(orgId: string, userId: string, id: string, input: IncidentInput, now = new Date()) {
    const before = await this.find(orgId, id);
    this.requireStatus(before, ['draft'], 'Kayıt yalnızca hazırlanırken değiştirilebilir. Onaydaysa önce onaydan geri çekin.');
    this.checkDates(
      input.occurredAt === undefined ? before.occurredAt : input.occurredAt,
      input.detectedAt ?? before.detectedAt,
      now,
    );
    const form: IncidentForm = { ...before.form, ...(input.form ?? {}) };
    const changed = [
      ...(['title', 'occurredAt', 'detectedAt', 'followUpRef'] as const).filter(
        (k) => input[k] !== undefined && String(input[k]) !== String(before[k]),
      ),
      ...(Object.keys(input.form ?? {}) as (keyof IncidentForm)[]).filter(
        (k) => JSON.stringify(before.form[k]) !== JSON.stringify(form[k]),
      ),
    ];
    if (changed.length === 0) return this.get(orgId, id, now);
    const { form: _f, ...columns } = input;
    await this.db
      .update(incidents)
      .set({ ...columns, form, updatedBy: userId, updatedAt: now })
      .where(eq(incidents.id, id));
    // Formdaki bilgiler kişisel veri içerebileceği için değerler değil yalnızca alan adları loglanır.
    await this.audit.record({
      action: 'incident.updated',
      organizationId: orgId,
      userId,
      entityType: 'incident',
      entityId: id,
      metadata: { number: before.number, fields: changed },
    });
    return this.get(orgId, id, now);
  }

  /** Yalnızca hazırlanan (hiç bildirilmemiş) kayıt silinebilir. */
  async remove(orgId: string, userId: string, id: string) {
    const incident = await this.find(orgId, id);
    this.requireStatus(incident, ['draft'], 'Yalnızca hazırlanmakta olan kayıt silinebilir');
    await this.db.delete(incidents).where(eq(incidents.id, id));
    await this.audit.record({
      action: 'incident.deleted',
      organizationId: orgId,
      userId,
      entityType: 'incident',
      entityId: id,
      metadata: { number: incident.number },
    });
  }

  async submit(orgId: string, userId: string, id: string, input: { approverId: string; note?: string | null }, now = new Date()) {
    const incident = await this.find(orgId, id);
    this.requireStatus(incident, ['draft'], 'Kayıt zaten onaya gönderilmiş veya kapatılmış');
    this.checkComplete(incident, now);
    await requireActiveMember(this.db, orgId, input.approverId, PERMISSIONS.INCIDENTS_APPROVE);
    const deadline = deadlineOf(incident);
    // Onay görevinin son günü bildirim süresinin son günüdür; takip bildiriminde varsayılan onay süresi.
    const today = dateIn(now);
    const dueDate = deadline ? (dateIn(deadline) < today ? today : dateIn(deadline)) : addDays(today, DEFAULT_APPROVAL_DUE_DAYS);
    const taskId = await this.db.transaction(async (tx) => {
      const [task] = await tx
        .insert(tasks)
        .values({
          organizationId: orgId,
          type: 'approval',
          title: `Onay: Veri ihlali bildirimi (İhlal #${incident.number})`,
          description: input.note ?? null,
          assigneeId: input.approverId,
          dueDate,
          reminderDays: deadline ? [] : DEFAULT_REMINDER_DAYS,
          entityType: 'incident',
          entityId: incident.id,
          createdBy: userId,
        })
        .returning({ id: tasks.id });
      const updated = await tx
        .update(incidents)
        .set({
          status: 'pending_approval',
          approverId: input.approverId,
          taskId: task.id,
          submittedAt: now,
          submittedBy: userId,
          updatedAt: now,
        })
        .where(and(eq(incidents.id, id), eq(incidents.status, 'draft')))
        .returning({ id: incidents.id });
      if (updated.length === 0) throw new ConflictException('Kayıt zaten onaya gönderilmiş');
      return task.id;
    });
    await this.audit.record({
      action: 'incident.submitted',
      organizationId: orgId,
      userId,
      entityType: 'incident',
      entityId: id,
      metadata: { number: incident.number, approverId: input.approverId },
    });
    if (input.approverId !== userId) {
      await this.notifications.notify({
        organizationId: orgId,
        userId: input.approverId,
        kind: 'approval_requested',
        title: `Onay talebi: Veri ihlali bildirimi (İhlal #${incident.number})`,
        body:
          `İhlal #${incident.number} ${incident.title} için hazırlanan Kurula bildirim formu onayınızı bekliyor.\n` +
          (deadline ? `Kurula bildirim için son süre: ${formatDateTime(deadline)}\n` : '') +
          (input.note ? `Not: ${input.note}\n` : ''),
        taskId,
        incidentId: id,
      });
    }
    return this.get(orgId, id, now);
  }

  async approve(orgId: string, userId: string, id: string, note?: string | null, now = new Date()) {
    return this.decide(orgId, userId, id, 'approved', note ?? null, now);
  }

  async reject(orgId: string, userId: string, id: string, note: string, now = new Date()) {
    return this.decide(orgId, userId, id, 'rejected', note, now);
  }

  /** Onaydaki kaydı düzenlemek için geri çeker (onaya gönderen veya `incidents.manage` yetkisi olan). */
  async withdraw(orgId: string, userId: string, id: string, now = new Date()) {
    const incident = await this.find(orgId, id);
    this.requireStatus(incident, ['pending_approval'], 'Kayıt onay beklemiyor');
    const [row] = await this.db
      .update(incidents)
      .set({ status: 'draft', approverId: null, taskId: null, updatedAt: now })
      .where(and(eq(incidents.id, id), eq(incidents.status, 'pending_approval')))
      .returning();
    if (!row) throw new ConflictException('Kayıt onay beklemiyor');
    if (incident.taskId) {
      await this.db.update(tasks).set({ status: 'cancelled', updatedAt: now }).where(and(eq(tasks.id, incident.taskId), eq(tasks.status, 'open')));
    }
    await this.audit.record({
      action: 'incident.withdrawn',
      organizationId: orgId,
      userId,
      entityType: 'incident',
      entityId: id,
      metadata: { number: incident.number },
    });
    return this.get(orgId, id, now);
  }

  /** Onaylanan bildirim Kurula gönderildi. */
  async markNotified(
    orgId: string,
    userId: string,
    permissions: Permission[],
    id: string,
    input: { notifiedAt?: Date | null; note?: string | null },
    now = new Date(),
  ) {
    this.requireAny(permissions);
    const incident = await this.find(orgId, id);
    this.requireStatus(incident, ['approved'], 'Kurula bildirildi olarak işaretlemek için bildirim formu önce onaylanmalı');
    const notifiedAt = input.notifiedAt ?? now;
    if (notifiedAt > now) throw this.fieldError('notifiedAt', 'Bildirim tarihi gelecekte olamaz');
    if (notifiedAt < incident.detectedAt) throw this.fieldError('notifiedAt', 'Bildirim tarihi tespit tarihinden önce olamaz');
    await this.close(orgId, userId, incident, 'notified', input.note ?? null, now, notifiedAt);
    return this.get(orgId, id, now);
  }

  /** Değerlendirme sonucunda Kurula bildirim gerekmediği kararıyla (gerekçe zorunlu) kapatır. */
  async closeWithoutNotice(orgId: string, userId: string, permissions: Permission[], id: string, note: string, now = new Date()) {
    this.requireAny(permissions);
    const incident = await this.find(orgId, id);
    this.requireStatus(incident, ['draft', 'approved'], 'Onay bekleyen veya kapatılmış kayıt bu şekilde kapatılamaz');
    await this.close(orgId, userId, incident, 'closed', note, now, null);
    return this.get(orgId, id, now);
  }

  /** Kurula bildirilmiş olaya takip bildirimi: son bildirimin bilgileri kopyalanır, yeni kayıt hazırlanır. */
  async followUp(orgId: string, userId: string, id: string, now = new Date()) {
    const source = await this.find(orgId, id);
    this.requireStatus(source, ['notified'], 'Takip bildirimi yalnızca Kurula bildirilmiş olay için oluşturulur');
    const rootId = source.parentId ?? source.id;
    const created = await this.insertNumbered(orgId, {
      title: source.title,
      notificationType: 'follow_up',
      parentId: rootId,
      followUpRef: source.followUpRef,
      occurredAt: source.occurredAt,
      detectedAt: source.detectedAt,
      form: { ...source.form, ...(await this.formDefaults(orgId, userId)), controllerName: source.form.controllerName, controllerAddress: source.form.controllerAddress, delayReason: null },
      createdBy: userId,
      updatedBy: userId,
    });
    await this.audit.record({
      action: 'incident.follow_up_created',
      organizationId: orgId,
      userId,
      entityType: 'incident',
      entityId: created.id,
      metadata: { number: created.number, parentId: rootId },
    });
    return this.get(orgId, created.id, now);
  }

  /** Doldurulmuş FRM-020 bildirim formu (Word). */
  async formDocx(orgId: string, userId: string, id: string) {
    const incident = await this.find(orgId, id);
    const file = buildFrm020Docx(incident);
    await this.audit.record({
      action: 'incident.form_downloaded',
      organizationId: orgId,
      userId,
      entityType: 'incident',
      entityId: id,
      metadata: { number: incident.number },
    });
    const kind = incident.notificationType === 'follow_up' ? 'Takip' : 'İlk';
    return { file, fileName: `FRM-020 KVK Veri İhlal Bildirim Formu - İhlal ${incident.number} (${kind} bildirim).docx` };
  }

  /** Raporlama: seçilen dönemde tespit edilen ihlallerin özeti. */
  async report(orgId: string, filter: { from?: IsoDate; to?: IsoDate }, now = new Date()) {
    const items = await this.list(orgId, filter, now);
    const initial = items.filter((i) => i.notificationType === 'initial');
    const notified = initial.filter((i) => i.notifiedAt);
    const tally = (values: string[], order: readonly string[]) => {
      const counts = new Map<string, number>(order.map((o) => [o, 0]));
      for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
      return [...counts].filter(([, n]) => n > 0).map(([label, count]) => ({ label, count }));
    };
    const hoursToNotify = notified.map((i) => (i.notifiedAt!.getTime() - i.detectedAt.getTime()) / HOUR_MS);
    const byStatus = Object.fromEntries(
      (Object.keys(INCIDENT_STATUSES) as IncidentStatus[]).map((s) => [s, items.filter((i) => i.status === s).length]),
    ) as Record<IncidentStatus, number>;
    return {
      from: filter.from ?? null,
      to: filter.to ?? null,
      total: initial.length,
      followUps: items.length - initial.length,
      byStatus,
      open: initial.filter((i) => INCIDENT_OPEN_STATUSES.includes(i.status)).length,
      openOverdue: initial.filter((i) => i.overdue).length,
      notified: notified.length,
      notifiedOnTime: notified.filter((i) => i.notifiedOnTime).length,
      notifiedLate: notified.filter((i) => i.notifiedOnTime === false).length,
      closedWithoutNotice: initial.filter((i) => i.status === 'closed').length,
      averageHoursToNotify: hoursToNotify.length ? Math.round(hoursToNotify.reduce((a, b) => a + b, 0) / hoursToNotify.length) : null,
      estimatedPeople: initial.reduce((a, i) => a + (i.form.estimatedPeople ?? 0), 0),
      estimatedRecords: initial.reduce((a, i) => a + (i.form.estimatedRecords ?? 0), 0),
      specialCategoryIncidents: initial.filter((i) => i.form.specialCategories.length > 0).length,
      cyberAttacks: initial.filter((i) => i.form.cyberAttack === true).length,
      bySource: tally(
        initial.flatMap((i) => [...i.form.sources, ...(i.form.sourceOther ? ['Diğer'] : [])]),
        [...INCIDENT_SOURCES, 'Diğer'],
      ),
      byCategory: tally(
        initial.flatMap((i) => [...i.form.personalCategories, ...i.form.specialCategories]),
        [...INCIDENT_PERSONAL_DATA_CATEGORIES, ...INCIDENT_SPECIAL_DATA_CATEGORIES],
      ),
      byLikelihood: tally(
        initial.map((i) => i.form.likelihood ?? 'unset'),
        ['high', 'medium', 'low', 'unknown', 'unset'],
      ),
      items,
    };
  }

  private async decide(orgId: string, userId: string, id: string, decision: 'approved' | 'rejected', note: string | null, now: Date) {
    const incident = await this.find(orgId, id);
    this.requireStatus(incident, ['pending_approval'], 'Kayıt onay beklemiyor');
    if (incident.approverId !== userId) throw new ForbiddenException('Bu talebi yalnızca seçilen onaylayıcı karara bağlayabilir');
    const [row] = await this.db
      .update(incidents)
      .set({
        status: decision === 'approved' ? 'approved' : 'draft',
        decision,
        decisionNote: note,
        decidedAt: now,
        decidedBy: userId,
        updatedAt: now,
      })
      .where(and(eq(incidents.id, id), eq(incidents.status, 'pending_approval')))
      .returning();
    if (!row) throw new ConflictException('Kayıt onay beklemiyor');
    if (incident.taskId) {
      await this.db
        .update(tasks)
        .set({ status: 'done', completedAt: now, completedBy: userId, completionNote: note, updatedAt: now })
        .where(and(eq(tasks.id, incident.taskId), eq(tasks.status, 'open')));
    }
    await this.audit.record({
      action: `incident.${decision}`,
      organizationId: orgId,
      userId,
      entityType: 'incident',
      entityId: id,
      metadata: { number: incident.number, ...(note ? { note } : {}) },
    });
    if (incident.submittedBy && incident.submittedBy !== userId) {
      const result = decision === 'approved' ? 'onaylandı' : 'geri çevrildi';
      await this.notifications.notify({
        organizationId: orgId,
        userId: incident.submittedBy,
        kind: 'approval_decided',
        title: `Veri ihlali bildirimi ${result} (İhlal #${incident.number})`,
        body:
          `İhlal #${incident.number} ${incident.title} için Kurula bildirim formu ${result}.\n` +
          (decision === 'approved'
            ? 'Formu indirip Kurula gönderdikten sonra kaydı "Kurula bildirildi" olarak işaretleyin.\n'
            : 'Kaydı düzeltip yeniden onaya gönderebilirsiniz.\n') +
          (note ? `Not: ${note}\n` : ''),
        taskId: incident.taskId,
        incidentId: id,
      });
    }
    return this.get(orgId, id, now);
  }

  private async close(
    orgId: string,
    userId: string,
    incident: IncidentRow,
    status: 'notified' | 'closed',
    note: string | null,
    now: Date,
    notifiedAt: Date | null,
  ) {
    const [row] = await this.db
      .update(incidents)
      .set({ status, notifiedAt, closingNote: note, closedAt: now, closedBy: userId, updatedAt: now })
      .where(and(eq(incidents.id, incident.id), eq(incidents.status, incident.status)))
      .returning();
    if (!row) throw new ConflictException('Kaydın durumu değişti, sayfayı yenileyin');
    await this.audit.record({
      action: status === 'notified' ? 'incident.notified' : 'incident.closed',
      organizationId: orgId,
      userId,
      entityType: 'incident',
      entityId: incident.id,
      metadata: {
        number: incident.number,
        ...(notifiedAt ? { notifiedAt: notifiedAt.toISOString(), onTime: withDeadline(row, now).notifiedOnTime } : {}),
      },
    });
  }

  /** Onaya göndermeden önce FRM-020'nin olmazsa olmaz cevapları. */
  private checkComplete(i: IncidentRow, now: Date) {
    const errors: { path: string; message: string }[] = [];
    const f = i.form;
    if (!f.description) errors.push({ path: 'description', message: 'İhlal hakkında bilgi verilmeli' });
    if (f.sources.length === 0 && !f.sourceOther) errors.push({ path: 'sources', message: 'En az bir kaynak seçilmeli' });
    if (f.personalCategories.length + f.specialCategories.length === 0 && !f.categoryOther) {
      errors.push({ path: 'personalCategories', message: 'Etkilenen en az bir veri kategorisi seçilmeli' });
    }
    if (!f.likelihood) errors.push({ path: 'likelihood', message: 'Seçilmeli (FRM-020’de zorunlu)' });
    const deadline = deadlineOf(i);
    if (deadline && now > deadline && !f.delayReason) {
      errors.push({ path: 'delayReason', message: `${INCIDENT_NOTIFY_DEADLINE_HOURS} saat geçtiği için gecikme sebebi yazılmalı` });
    }
    if (errors.length) {
      throw new BadRequestException({
        message: `Onaya göndermeden önce eksikleri tamamlayın: ${errors.map((e) => fieldName(e.path)).join(', ')}`,
        errors,
      });
    }
  }

  private checkDates(occurredAt: Date | null, detectedAt: Date, now: Date) {
    // Saat farkı ve cihaz saati sapmaları için birkaç dakika pay bırakılır.
    const future = new Date(now.getTime() + 5 * 60 * 1000);
    if (detectedAt > future) throw this.fieldError('detectedAt', 'Tespit tarihi gelecekte olamaz');
    if (occurredAt && occurredAt > future) throw this.fieldError('occurredAt', 'Gerçekleşme tarihi gelecekte olamaz');
    if (occurredAt && occurredAt > detectedAt) throw this.fieldError('occurredAt', 'Tespit tarihinden sonra olamaz');
  }

  private fieldError(path: string, message: string) {
    return new BadRequestException({ message, errors: [{ path, message }] });
  }

  private requireStatus(i: IncidentRow, allowed: IncidentStatus[], message: string) {
    if (!allowed.includes(i.status)) throw new ConflictException(message);
  }

  private requireAny(permissions: Permission[]) {
    if (!MANAGE_OR_APPROVE.some((p) => permissions.includes(p))) throw new ForbiddenException('Bu işlem için yetkiniz yok');
  }

  /** Sıra numarasını verip kaydeder; aynı anda iki kayıt açılırsa numara çakışması yeniden denenir. */
  private async insertNumbered(orgId: string, values: Omit<typeof incidents.$inferInsert, 'organizationId' | 'number'>) {
    for (let attempt = 0; ; attempt++) {
      const [{ last }] = await this.db.select({ last: max(incidents.number) }).from(incidents).where(eq(incidents.organizationId, orgId));
      try {
        const [row] = await this.db
          .insert(incidents)
          .values({ ...values, organizationId: orgId, number: (last ?? 0) + 1 })
          .returning();
        return row;
      } catch (err) {
        if (!isUniqueViolation(err) || attempt >= 4) throw err;
      }
    }
  }

  /** Sorumlu ve Yöneticilere (işlemi yapan hariç) bildirim. */
  private async notifyTeam(orgId: string, actorId: string, incident: IncidentRow, n: { kind: 'incident_recorded'; title: string; body: string }) {
    const members = await activeMembersWithAny(this.db, orgId, MANAGE_OR_APPROVE);
    for (const m of members) {
      if (m.id === actorId) continue;
      await this.notifications.notify({ organizationId: orgId, userId: m.id, incidentId: incident.id, ...n });
    }
  }

  private async views(rows: IncidentRow[], now: Date): Promise<IncidentView[]> {
    const ids = [...new Set(rows.flatMap((r) => [r.approverId, r.createdBy, r.decidedBy]).filter((v): v is string => !!v))];
    const people = ids.length
      ? await this.db.select({ id: users.id, fullName: users.fullName }).from(users).where(inArray(users.id, ids))
      : [];
    const byId = new Map(people.map((p) => [p.id, p]));
    const person = (id: string | null) => (id ? (byId.get(id) ?? null) : null);
    return rows.map((r) => ({
      ...withDeadline(r, now),
      approver: person(r.approverId),
      createdByUser: person(r.createdBy),
      decidedByUser: person(r.decidedBy),
    }));
  }

  private async find(orgId: string, id: string) {
    const [row] = await this.db.select().from(incidents).where(and(eq(incidents.id, id), eq(incidents.organizationId, orgId)));
    if (!row) throw new NotFoundException('Veri ihlali kaydı bulunamadı');
    return row;
  }
}

function fieldName(path: string) {
  return (INCIDENT_FIELD_LABELS as Record<string, string>)[path] ?? path;
}

function inRange(d: Date, from?: IsoDate, to?: IsoDate) {
  const day = dateIn(d);
  return (!from || day >= from) && (!to || day <= to);
}
