import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  DEFAULT_APPROVAL_DUE_DAYS,
  DEFAULT_REMINDER_DAYS,
  DestructionOperation,
  PERMISSIONS,
  StorageMedium,
} from '@kvkk/shared';
import { and, asc, desc, eq, gte, inArray, lte, ne, SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { AuditService } from '../audit/audit.service';
import { Database, InjectDb } from '../db/db.module';
import {
  destructionItems,
  destructionOfficers,
  destructionPlans,
  destructionRecords,
  employees,
  inventoryEntries,
  organizations,
  tasks,
  users,
} from '../db/schema';
import { addDays, addMonths, dateIn, formatDate, IsoDate } from '../workflow/dates';
import { findActiveMember, requireActiveMember } from '../workflow/members';
import { NotificationsService } from '../workflow/notifications.service';

type Officer = typeof destructionOfficers.$inferSelect;
type Plan = typeof destructionPlans.$inferSelect;
type Item = typeof destructionItems.$inferSelect;

export interface OfficerInput {
  employeeId?: string | null;
  fullName?: string;
  title?: string | null;
  startDate?: IsoDate;
  endDate?: IsoDate | null;
  note?: string | null;
}

export interface PlanInput {
  title?: string;
  periodStart?: IsoDate;
  periodEnd?: IsoDate;
  description?: string | null;
}

export interface ItemInput {
  inventoryEntryId?: string | null;
  dataDescription?: string;
  storageMedium?: StorageMedium | null;
  retentionPeriod?: string | null;
  plannedDate?: IsoDate;
  operationType?: DestructionOperation;
  method?: string | null;
  officerId?: string | null;
}

export interface RecordInput {
  inventoryEntryId?: string | null;
  dataDescription?: string;
  storageMedium?: StorageMedium | null;
  performedDate?: IsoDate;
  operationType?: DestructionOperation;
  performedNote?: string;
  officerId?: string | null;
}

export interface RecordFilter {
  from?: IsoDate;
  to?: IsoDate;
  operationType?: DestructionOperation;
  q?: string;
}

/** Plan içeriğini değiştiren alanlar: onaylı plan bunlardan biri değişince yeniden onaya gider. */
const PLANNING_FIELDS: (keyof ItemInput)[] = [
  'inventoryEntryId',
  'dataDescription',
  'storageMedium',
  'retentionPeriod',
  'plannedDate',
  'operationType',
  'method',
];

const FAR_FUTURE = '9999-12-31';
const overlaps = (a: Pick<Officer, 'startDate' | 'endDate'>, b: Pick<Officer, 'startDate' | 'endDate'>) =>
  a.startDate <= (b.endDate ?? FAR_FUTURE) && b.startDate <= (a.endDate ?? FAR_FUTURE);

/** Envanter satırının imha planında görünen adı. */
const describeEntry = (e: { department: string; activity: string; dataCategory: string }) =>
  `${e.department} / ${e.activity} / ${e.dataCategory}`;

/** Kayıt ortamına göre önerilen imha yöntemi: fiziksel evrak yok edilir, dijital veri silinir. */
const suggestedOperation = (medium: StorageMedium | null): DestructionOperation =>
  medium === 'physical' ? 'destruction' : 'deletion';

const approver = alias(users, 'approver');
const requester = alias(users, 'requester');
const decider = alias(users, 'decider');

/**
 * Kişisel veri imha yönetimi: imha sorumluları (dönem geçmişiyle), veri envanterinden hazırlanan dönemsel
 * imha planları ve gerçekleşen imha işlemi kayıtları.
 */
@Injectable()
export class DestructionService {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  // ---- Ayarlar ----

  /** Periyodik imha süresi ve bugünü kapsayan bir plan olup olmadığı. */
  async settings(orgId: string, now = new Date()) {
    const today = dateIn(now);
    const [org] = await this.db
      .select({ periodMonths: organizations.destructionPeriodMonths })
      .from(organizations)
      .where(eq(organizations.id, orgId));
    const [last] = await this.db
      .select({ periodEnd: destructionPlans.periodEnd })
      .from(destructionPlans)
      .where(eq(destructionPlans.organizationId, orgId))
      .orderBy(desc(destructionPlans.periodEnd))
      .limit(1);
    const lastPlanEnd = last?.periodEnd ?? null;
    return {
      periodMonths: org.periodMonths,
      lastPlanEnd,
      /** Bir sonraki dönemin başlangıcı (hiç plan yoksa bugün). */
      nextPeriodStart: lastPlanEnd ? addDays(lastPlanEnd, 1) : today,
      /** Bugün hiçbir planın dönemine girmiyorsa uyarı gösterilir. */
      uncovered: !lastPlanEnd || lastPlanEnd < today,
    };
  }

  async updateSettings(orgId: string, userId: string, periodMonths: number) {
    await this.db.update(organizations).set({ destructionPeriodMonths: periodMonths }).where(eq(organizations.id, orgId));
    await this.audit.record({
      action: 'destruction.settings_updated',
      organizationId: orgId,
      userId,
      entityType: 'organization',
      entityId: orgId,
      metadata: { periodMonths },
    });
    return this.settings(orgId);
  }

  /** İmha sorumlusu seçmek için kuruluşun çalışmaya devam eden çalışanları. */
  async employeeOptions(orgId: string, now = new Date()) {
    const today = dateIn(now);
    const rows = await this.db
      .select({
        id: employees.id,
        firstName: employees.firstName,
        lastName: employees.lastName,
        terminationDate: employees.terminationDate,
      })
      .from(employees)
      .where(eq(employees.organizationId, orgId));
    return rows
      .filter((e) => !e.terminationDate || e.terminationDate >= today)
      .map((e) => ({ id: e.id, fullName: `${e.firstName} ${e.lastName}` }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'tr'));
  }

  // ---- İmha sorumluları ----

  async listOfficers(orgId: string, now = new Date()) {
    const today = dateIn(now);
    const rows = await this.db
      .select()
      .from(destructionOfficers)
      .where(eq(destructionOfficers.organizationId, orgId))
      .orderBy(desc(destructionOfficers.startDate));
    return rows.map((o) => ({ ...o, current: o.startDate <= today && (!o.endDate || o.endDate >= today) }));
  }

  /**
   * Sorumlu ekler. Bitiş tarihi verilmezse yeni güncel sorumlu olur ve önceki güncel sorumlunun dönemi
   * yeni sorumlunun başlangıcından bir gün önce kapanır. Bitiş tarihi verilirse geçmiş bir dönem kaydıdır.
   */
  async createOfficer(orgId: string, userId: string, input: OfficerInput) {
    const fullName = await this.officerName(orgId, input.employeeId, input.fullName);
    const startDate = input.startDate!;
    const endDate = input.endDate ?? null;
    this.checkPeriod(startDate, endDate);
    const officer = await this.db.transaction(async (tx) => {
      const others = await tx.select().from(destructionOfficers).where(eq(destructionOfficers.organizationId, orgId));
      const open = others.find((o) => !o.endDate);
      if (!endDate && open) {
        if (open.startDate >= startDate) {
          throw new BadRequestException({
            message: `Yeni sorumlunun başlangıç tarihi, güncel sorumlunun (${open.fullName}) başlangıcından sonra olmalı`,
            errors: [{ path: 'startDate', message: `${formatDate(open.startDate)} tarihinden sonra olmalı` }],
          });
        }
        open.endDate = addDays(startDate, -1);
        await tx
          .update(destructionOfficers)
          .set({ endDate: open.endDate, updatedAt: new Date() })
          .where(eq(destructionOfficers.id, open.id));
      }
      this.checkOverlap(others, { startDate, endDate });
      const [created] = await tx
        .insert(destructionOfficers)
        .values({
          organizationId: orgId,
          employeeId: input.employeeId ?? null,
          fullName,
          title: input.title ?? null,
          startDate,
          endDate,
          note: input.note ?? null,
          createdBy: userId,
        })
        .returning();
      return { created, closed: !endDate && open ? open : null };
    });
    await this.audit.record({
      action: 'destruction.officer_assigned',
      organizationId: orgId,
      userId,
      entityType: 'destruction_officer',
      entityId: officer.created.id,
      metadata: { startDate, endDate, previousOfficerId: officer.closed?.id ?? null },
    });
    return officer.created;
  }

  /** Sorumlu kaydını düzeltir (ad, unvan, tarih). Dönemler çakışamaz, kayıt silinmez. */
  async updateOfficer(orgId: string, userId: string, id: string, input: OfficerInput) {
    const before = await this.findOfficer(orgId, id);
    const next = {
      startDate: input.startDate ?? before.startDate,
      endDate: input.endDate === undefined ? before.endDate : input.endDate,
    };
    this.checkPeriod(next.startDate, next.endDate);
    const others = (
      await this.db.select().from(destructionOfficers).where(eq(destructionOfficers.organizationId, orgId))
    ).filter((o) => o.id !== id);
    this.checkOverlap(others, next);
    const fullName =
      input.employeeId !== undefined || input.fullName !== undefined
        ? await this.officerName(orgId, input.employeeId ?? null, input.fullName ?? before.fullName)
        : before.fullName;
    const [officer] = await this.db
      .update(destructionOfficers)
      .set({
        ...(input.employeeId !== undefined ? { employeeId: input.employeeId } : {}),
        fullName,
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.note !== undefined ? { note: input.note } : {}),
        ...next,
        updatedAt: new Date(),
      })
      .where(eq(destructionOfficers.id, id))
      .returning();
    await this.audit.record({
      action: 'destruction.officer_updated',
      organizationId: orgId,
      userId,
      entityType: 'destruction_officer',
      entityId: id,
      metadata: { fields: Object.keys(input) },
    });
    return officer;
  }

  // ---- İmha planları ----

  async listPlans(orgId: string) {
    const plans = await this.db
      .select()
      .from(destructionPlans)
      .where(eq(destructionPlans.organizationId, orgId))
      .orderBy(desc(destructionPlans.periodStart), desc(destructionPlans.createdAt));
    const items = await this.db
      .select({ planId: destructionItems.planId, status: destructionItems.status })
      .from(destructionItems)
      .where(eq(destructionItems.organizationId, orgId));
    return plans.map((p) => {
      const own = items.filter((i) => i.planId === p.id);
      return {
        ...p,
        itemCount: own.length,
        doneCount: own.filter((i) => i.status === 'done').length,
        cancelledCount: own.filter((i) => i.status === 'cancelled').length,
      };
    });
  }

  async createPlan(orgId: string, userId: string, input: PlanInput & { fromInventory?: boolean }) {
    this.checkPlanPeriod(input.periodStart!, input.periodEnd!);
    const [plan] = await this.db
      .insert(destructionPlans)
      .values({
        organizationId: orgId,
        title: input.title!,
        periodStart: input.periodStart!,
        periodEnd: input.periodEnd!,
        description: input.description ?? null,
        createdBy: userId,
      })
      .returning();
    await this.audit.record({
      action: 'destruction.plan_created',
      organizationId: orgId,
      userId,
      entityType: 'destruction_plan',
      entityId: plan.id,
      metadata: { title: plan.title, periodStart: plan.periodStart, periodEnd: plan.periodEnd },
    });
    if (input.fromInventory) await this.addFromInventory(orgId, userId, plan.id);
    return this.getPlan(orgId, plan.id);
  }

  /**
   * Bir sonraki dönemin planı: dönem, önceki planın bitişinden başlar ve periyodik imha süresi kadar sürer.
   * İptal edilmemiş işler planlanan tarihleri aynı süre kadar ileri alınarak kopyalanır.
   */
  async nextPlan(orgId: string, userId: string, id: string, title?: string) {
    const previous = await this.findPlan(orgId, id);
    const { periodMonths } = await this.settings(orgId);
    const periodStart = addDays(previous.periodEnd, 1);
    const periodEnd = addDays(addMonths(periodStart, periodMonths), -1);
    const items = await this.db
      .select()
      .from(destructionItems)
      .where(and(eq(destructionItems.planId, id), ne(destructionItems.status, 'cancelled')))
      .orderBy(asc(destructionItems.plannedDate));
    const plan = await this.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(destructionPlans)
        .values({
          organizationId: orgId,
          title: title ?? `${formatDate(periodStart)} – ${formatDate(periodEnd)} imha planı`,
          periodStart,
          periodEnd,
          description: previous.description,
          createdBy: userId,
        })
        .returning();
      for (const item of items) {
        let plannedDate = addMonths(item.plannedDate, periodMonths);
        if (plannedDate < periodStart || plannedDate > periodEnd) plannedDate = periodEnd;
        const officer = await this.officerAt(orgId, plannedDate);
        await tx.insert(destructionItems).values({
          organizationId: orgId,
          planId: created.id,
          inventoryEntryId: item.inventoryEntryId,
          dataDescription: item.dataDescription,
          storageMedium: item.storageMedium,
          retentionPeriod: item.retentionPeriod,
          plannedDate,
          operationType: item.operationType,
          method: item.method,
          officerId: officer?.id ?? null,
          officerName: officer?.fullName ?? null,
          createdBy: userId,
        });
      }
      return created;
    });
    await this.audit.record({
      action: 'destruction.plan_created',
      organizationId: orgId,
      userId,
      entityType: 'destruction_plan',
      entityId: plan.id,
      metadata: { previousPlanId: id, periodStart, periodEnd, items: items.length },
    });
    return this.getPlan(orgId, plan.id);
  }

  async getPlan(orgId: string, id: string, now = new Date()) {
    const [row] = await this.db
      .select({
        plan: destructionPlans,
        approver: { id: approver.id, fullName: approver.fullName },
        requestedBy: { id: requester.id, fullName: requester.fullName },
        decidedBy: { id: decider.id, fullName: decider.fullName },
        approvalDueDate: tasks.dueDate,
      })
      .from(destructionPlans)
      .leftJoin(approver, eq(approver.id, destructionPlans.approverId))
      .leftJoin(requester, eq(requester.id, destructionPlans.requestedBy))
      .leftJoin(decider, eq(decider.id, destructionPlans.decidedBy))
      .leftJoin(tasks, eq(tasks.id, destructionPlans.approvalTaskId))
      .where(and(eq(destructionPlans.id, id), eq(destructionPlans.organizationId, orgId)));
    if (!row) throw new NotFoundException('İmha planı bulunamadı');
    const today = dateIn(now);
    const items = await this.db
      .select({ item: destructionItems, record: destructionRecords })
      .from(destructionItems)
      .leftJoin(destructionRecords, eq(destructionRecords.itemId, destructionItems.id))
      .where(eq(destructionItems.planId, id))
      .orderBy(asc(destructionItems.plannedDate), asc(destructionItems.createdAt));
    return {
      ...row.plan,
      approver: row.approver?.id ? row.approver : null,
      requestedBy: row.requestedBy?.id ? row.requestedBy : null,
      decidedBy: row.decidedBy?.id ? row.decidedBy : null,
      approvalDueDate: row.approvalDueDate ?? null,
      items: items.map(({ item, record }) => ({
        ...item,
        overdue: item.status === 'planned' && item.plannedDate < today,
        record: record
          ? {
              id: record.id,
              performedDate: record.performedDate,
              operationType: record.operationType,
              performedNote: record.performedNote,
              officerName: record.officerName,
            }
          : null,
      })),
    };
  }

  async updatePlan(orgId: string, userId: string, id: string, input: PlanInput) {
    const before = await this.findPlan(orgId, id);
    this.assertEditable(before);
    this.checkPlanPeriod(input.periodStart ?? before.periodStart, input.periodEnd ?? before.periodEnd);
    const periodChanged =
      (input.periodStart && input.periodStart !== before.periodStart) ||
      (input.periodEnd && input.periodEnd !== before.periodEnd);
    await this.db
      .update(destructionPlans)
      .set({ ...input, ...(periodChanged ? this.backToDraft(before) : {}), updatedAt: new Date() })
      .where(eq(destructionPlans.id, id));
    await this.audit.record({
      action: 'destruction.plan_updated',
      organizationId: orgId,
      userId,
      entityType: 'destruction_plan',
      entityId: id,
      metadata: { fields: Object.keys(input) },
    });
    return this.getPlan(orgId, id);
  }

  /** Gerçekleşmiş imha içeren plan silinmez; imha işlemi kayıtları planla birlikte saklanmalıdır. */
  async deletePlan(orgId: string, userId: string, id: string) {
    const plan = await this.findPlan(orgId, id);
    this.assertEditable(plan);
    const items = await this.db.select().from(destructionItems).where(eq(destructionItems.planId, id));
    if (items.some((i) => i.status === 'done')) {
      throw new ConflictException('Gerçekleşmiş imha içeren plan silinemez');
    }
    await this.db.transaction(async (tx) => {
      const taskIds = items.map((i) => i.taskId).filter((t): t is string => !!t);
      if (plan.approvalTaskId) taskIds.push(plan.approvalTaskId);
      if (taskIds.length > 0) {
        await tx
          .update(tasks)
          .set({ status: 'cancelled', updatedAt: new Date() })
          .where(and(inArray(tasks.id, taskIds), eq(tasks.status, 'open')));
      }
      await tx.delete(destructionPlans).where(eq(destructionPlans.id, id));
    });
    await this.audit.record({
      action: 'destruction.plan_deleted',
      organizationId: orgId,
      userId,
      entityType: 'destruction_plan',
      entityId: id,
      metadata: { title: plan.title },
    });
  }

  // ---- Plandaki imha işleri ----

  async addItem(orgId: string, userId: string, planId: string, input: ItemInput) {
    const plan = await this.findPlan(orgId, planId);
    this.assertEditable(plan);
    const fromEntry = await this.entryDefaults(orgId, input.inventoryEntryId);
    const plannedDate = input.plannedDate!;
    const officer = await this.resolveOfficer(orgId, input.officerId, plannedDate);
    const storageMedium = input.storageMedium !== undefined ? input.storageMedium : (fromEntry?.storageMedium ?? null);
    const [item] = await this.db
      .insert(destructionItems)
      .values({
        organizationId: orgId,
        planId,
        inventoryEntryId: input.inventoryEntryId ?? null,
        dataDescription: input.dataDescription || fromEntry!.dataDescription,
        storageMedium,
        retentionPeriod: input.retentionPeriod !== undefined ? input.retentionPeriod : (fromEntry?.retentionPeriod ?? null),
        plannedDate,
        operationType: input.operationType ?? suggestedOperation(storageMedium),
        method: input.method ?? null,
        officerId: officer?.id ?? null,
        officerName: officer?.fullName ?? null,
        createdBy: userId,
      })
      .returning();
    await this.planningChanged(plan);
    await this.audit.record({
      action: 'destruction.item_added',
      organizationId: orgId,
      userId,
      entityType: 'destruction_item',
      entityId: item.id,
      metadata: { planId, plannedDate, operationType: item.operationType },
    });
    return item;
  }

  /**
   * Veri envanterindeki satırları plana imha işi olarak ekler: veri, kayıt ortamı ve saklama süresi envanterden
   * gelir; planlanan tarih dönem sonudur. Plana zaten eklenmiş (iptal edilmemiş) satırlar atlanır.
   */
  async addFromInventory(orgId: string, userId: string, planId: string, entryIds?: string[]) {
    const plan = await this.findPlan(orgId, planId);
    this.assertEditable(plan);
    const conditions: SQL[] = [eq(inventoryEntries.organizationId, orgId)];
    if (entryIds) {
      if (entryIds.length === 0) return { added: 0 };
      conditions.push(inArray(inventoryEntries.id, entryIds));
    }
    const entries = await this.db
      .select()
      .from(inventoryEntries)
      .where(and(...conditions))
      .orderBy(asc(inventoryEntries.department), asc(inventoryEntries.activity), asc(inventoryEntries.createdAt));
    if (entryIds && entries.length !== new Set(entryIds).size) {
      throw new BadRequestException('Seçilen envanter satırlarından bazıları bulunamadı');
    }
    const existing = new Set(
      (
        await this.db
          .select({ entryId: destructionItems.inventoryEntryId })
          .from(destructionItems)
          .where(and(eq(destructionItems.planId, planId), ne(destructionItems.status, 'cancelled')))
      ).map((r) => r.entryId),
    );
    const fresh = entries.filter((e) => !existing.has(e.id));
    if (fresh.length === 0) return { added: 0 };
    const officer = await this.officerAt(orgId, plan.periodEnd);
    await this.db.insert(destructionItems).values(
      fresh.map((e) => ({
        organizationId: orgId,
        planId,
        inventoryEntryId: e.id,
        dataDescription: describeEntry(e),
        storageMedium: e.storageMedium,
        retentionPeriod: e.retentionPeriod,
        plannedDate: plan.periodEnd,
        operationType: suggestedOperation(e.storageMedium),
        officerId: officer?.id ?? null,
        officerName: officer?.fullName ?? null,
        createdBy: userId,
      })),
    );
    await this.planningChanged(plan);
    await this.audit.record({
      action: 'destruction.items_from_inventory',
      organizationId: orgId,
      userId,
      entityType: 'destruction_plan',
      entityId: planId,
      metadata: { added: fresh.length },
    });
    return { added: fresh.length };
  }

  /**
   * Planlanan işi değiştirir. Sorumlu değişikliği planın onayını bozmaz; veri, tarih veya yöntem değişirse
   * onaylı plan yeniden taslağa döner.
   */
  async updateItem(orgId: string, userId: string, id: string, input: ItemInput) {
    const { item, plan } = await this.findItem(orgId, id);
    if (item.status !== 'planned') throw new ConflictException('Yalnızca planlanan durumdaki iş değiştirilebilir');
    const planning = PLANNING_FIELDS.filter((f) => input[f] !== undefined && input[f] !== item[f]);
    if (planning.length > 0) this.assertEditable(plan);
    const set: Partial<Item> = { updatedAt: new Date() };
    for (const f of planning) Object.assign(set, { [f]: input[f] });
    if (input.inventoryEntryId && planning.includes('inventoryEntryId') && !input.dataDescription) {
      const fromEntry = await this.entryDefaults(orgId, input.inventoryEntryId);
      set.dataDescription = fromEntry!.dataDescription;
    }
    if (input.officerId !== undefined && input.officerId !== item.officerId) {
      const officer = input.officerId ? await this.findOfficer(orgId, input.officerId) : null;
      set.officerId = officer?.id ?? null;
      set.officerName = officer?.fullName ?? null;
    }
    await this.db.transaction(async (tx) => {
      await tx.update(destructionItems).set(set).where(eq(destructionItems.id, id));
      if (set.plannedDate && item.taskId) {
        await tx
          .update(tasks)
          .set({ dueDate: set.plannedDate, updatedAt: new Date() })
          .where(and(eq(tasks.id, item.taskId), eq(tasks.status, 'open')));
      }
    });
    if (planning.length > 0) await this.planningChanged(plan);
    await this.audit.record({
      action: 'destruction.item_updated',
      organizationId: orgId,
      userId,
      entityType: 'destruction_item',
      entityId: id,
      metadata: {
        fields: Object.keys(input),
        ...(set.officerId !== undefined ? { officerFrom: item.officerName, officerTo: set.officerName } : {}),
      },
    });
    return this.getItem(orgId, id);
  }

  async deleteItem(orgId: string, userId: string, id: string) {
    const { item, plan } = await this.findItem(orgId, id);
    if (item.status === 'done') throw new ConflictException('Gerçekleşmiş imha silinemez; önce imha kaydını silin');
    this.assertEditable(plan);
    await this.db.transaction(async (tx) => {
      if (item.taskId) await this.closeTask(tx, item.taskId, 'cancelled');
      await tx.delete(destructionItems).where(eq(destructionItems.id, id));
    });
    await this.planningChanged(plan);
    await this.audit.record({
      action: 'destruction.item_deleted',
      organizationId: orgId,
      userId,
      entityType: 'destruction_item',
      entityId: id,
      metadata: { planId: plan.id },
    });
  }

  /** İmhanın yapılmayacağını gerekçesiyle kaydeder (ör. saklama süresi dolmamış). */
  async cancelItem(orgId: string, userId: string, id: string, reason: string) {
    const { item, plan } = await this.findItem(orgId, id);
    if (item.status !== 'planned') throw new ConflictException('Yalnızca planlanan durumdaki iş iptal edilebilir');
    this.assertEditable(plan);
    await this.db.transaction(async (tx) => {
      await tx
        .update(destructionItems)
        .set({ status: 'cancelled', cancelReason: reason, updatedAt: new Date() })
        .where(eq(destructionItems.id, id));
      if (item.taskId) await this.closeTask(tx, item.taskId, 'cancelled');
    });
    await this.audit.record({
      action: 'destruction.item_cancelled',
      organizationId: orgId,
      userId,
      entityType: 'destruction_item',
      entityId: id,
      metadata: { reason },
    });
    return this.getItem(orgId, id);
  }

  /** İmhanın gerçekleştiğini kaydeder: imha işlemi kaydı açılır, iş ve hatırlatma görevi kapanır. */
  async completeItem(
    orgId: string,
    userId: string,
    id: string,
    input: { performedDate: IsoDate; operationType?: DestructionOperation; performedNote: string; officerId?: string | null },
    now = new Date(),
  ) {
    const { item, plan } = await this.findItem(orgId, id);
    if (item.status !== 'planned') throw new ConflictException('Bu iş zaten kapatılmış');
    if (plan.status === 'pending') throw new ConflictException('Plan onay beklerken imha kaydı girilemez');
    if (input.performedDate > dateIn(now)) throw new BadRequestException('Gerçekleşme tarihi ileri bir gün olamaz');
    const officer =
      input.officerId !== undefined && input.officerId !== null
        ? await this.findOfficer(orgId, input.officerId)
        : item.officerId
          ? { id: item.officerId, fullName: item.officerName }
          : await this.officerAt(orgId, input.performedDate);
    const record = await this.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(destructionRecords)
        .values({
          organizationId: orgId,
          itemId: item.id,
          planId: plan.id,
          planTitle: plan.title,
          inventoryEntryId: item.inventoryEntryId,
          dataDescription: item.dataDescription,
          storageMedium: item.storageMedium,
          plannedDate: item.plannedDate,
          performedDate: input.performedDate,
          operationType: input.operationType ?? item.operationType,
          performedNote: input.performedNote,
          officerId: officer?.id ?? null,
          officerName: officer?.fullName ?? item.officerName,
          createdBy: userId,
        })
        .returning();
      await tx
        .update(destructionItems)
        .set({ status: 'done', updatedAt: new Date() })
        .where(eq(destructionItems.id, item.id));
      if (item.taskId) await this.closeTask(tx, item.taskId, 'done', userId, input.performedNote);
      return created;
    });
    await this.audit.record({
      action: 'destruction.performed',
      organizationId: orgId,
      userId,
      entityType: 'destruction_record',
      entityId: record.id,
      metadata: { itemId: item.id, planId: plan.id, operationType: record.operationType, performedDate: record.performedDate },
    });
    return record;
  }

  // ---- İmha işlemi kayıtları ----

  async listRecords(orgId: string, filter: RecordFilter = {}) {
    const conditions: SQL[] = [eq(destructionRecords.organizationId, orgId)];
    if (filter.from) conditions.push(gte(destructionRecords.performedDate, filter.from));
    if (filter.to) conditions.push(lte(destructionRecords.performedDate, filter.to));
    if (filter.operationType) conditions.push(eq(destructionRecords.operationType, filter.operationType));
    let rows = await this.db
      .select()
      .from(destructionRecords)
      .where(and(...conditions))
      .orderBy(desc(destructionRecords.performedDate), desc(destructionRecords.createdAt));
    if (filter.q) {
      const q = filter.q.toLocaleLowerCase('tr-TR');
      rows = rows.filter((r) =>
        [r.dataDescription, r.performedNote, r.officerName, r.planTitle].some((v) => v?.toLocaleLowerCase('tr-TR').includes(q)),
      );
    }
    return rows;
  }

  /** Plan dışı imha kaydı (ör. ilgili kişinin silme talebi üzerine yapılan imha). */
  async createRecord(orgId: string, userId: string, input: RecordInput, now = new Date()) {
    if (input.performedDate! > dateIn(now)) throw new BadRequestException('Gerçekleşme tarihi ileri bir gün olamaz');
    const fromEntry = await this.entryDefaults(orgId, input.inventoryEntryId);
    const officer = await this.resolveOfficer(orgId, input.officerId, input.performedDate!);
    const [record] = await this.db
      .insert(destructionRecords)
      .values({
        organizationId: orgId,
        inventoryEntryId: input.inventoryEntryId ?? null,
        dataDescription: input.dataDescription || fromEntry!.dataDescription,
        storageMedium: input.storageMedium !== undefined ? input.storageMedium : (fromEntry?.storageMedium ?? null),
        performedDate: input.performedDate!,
        operationType: input.operationType!,
        performedNote: input.performedNote!,
        officerId: officer?.id ?? null,
        officerName: officer?.fullName ?? null,
        createdBy: userId,
      })
      .returning();
    await this.audit.record({
      action: 'destruction.performed',
      organizationId: orgId,
      userId,
      entityType: 'destruction_record',
      entityId: record.id,
      metadata: { operationType: record.operationType, performedDate: record.performedDate },
    });
    return record;
  }

  async updateRecord(orgId: string, userId: string, id: string, input: RecordInput, now = new Date()) {
    const before = await this.findRecord(orgId, id);
    if (input.performedDate && input.performedDate > dateIn(now)) {
      throw new BadRequestException('Gerçekleşme tarihi ileri bir gün olamaz');
    }
    const { officerId, ...rest } = input;
    const set: Partial<typeof destructionRecords.$inferInsert> = { ...rest, updatedAt: new Date() };
    if (officerId !== undefined && officerId !== before.officerId) {
      const officer = officerId ? await this.findOfficer(orgId, officerId) : null;
      set.officerId = officer?.id ?? null;
      set.officerName = officer?.fullName ?? null;
    }
    const [record] = await this.db.update(destructionRecords).set(set).where(eq(destructionRecords.id, id)).returning();
    await this.audit.record({
      action: 'destruction.record_updated',
      organizationId: orgId,
      userId,
      entityType: 'destruction_record',
      entityId: id,
      metadata: { fields: Object.keys(input) },
    });
    return record;
  }

  /** Yanlış girilen kaydı siler; plandan geldiyse iş yeniden "planlandı" olur ve hatırlatma görevi açılır. */
  async deleteRecord(orgId: string, userId: string, id: string) {
    const record = await this.findRecord(orgId, id);
    await this.db.transaction(async (tx) => {
      await tx.delete(destructionRecords).where(eq(destructionRecords.id, id));
      if (!record.itemId) return;
      const [item] = await tx
        .update(destructionItems)
        .set({ status: 'planned', updatedAt: new Date() })
        .where(eq(destructionItems.id, record.itemId))
        .returning();
      if (item?.taskId) {
        await tx
          .update(tasks)
          .set({ status: 'open', completedAt: null, completedBy: null, completionNote: null, updatedAt: new Date() })
          .where(and(eq(tasks.id, item.taskId), eq(tasks.status, 'done')));
      }
    });
    await this.audit.record({
      action: 'destruction.record_deleted',
      organizationId: orgId,
      userId,
      entityType: 'destruction_record',
      entityId: id,
      metadata: { itemId: record.itemId, performedDate: record.performedDate, operationType: record.operationType },
    });
  }

  // ---- Yönetici onayı ----

  async submit(
    orgId: string,
    userId: string,
    id: string,
    input: { approverId: string; dueDate?: IsoDate | null; note?: string | null },
    now = new Date(),
  ) {
    const plan = await this.findPlan(orgId, id);
    if (plan.status === 'pending') throw new ConflictException('Plan zaten onay bekliyor');
    if (plan.status === 'approved') throw new ConflictException('Plan zaten onaylı');
    const planned = await this.db
      .select({ id: destructionItems.id })
      .from(destructionItems)
      .where(and(eq(destructionItems.planId, id), eq(destructionItems.status, 'planned')));
    if (planned.length === 0) throw new ConflictException('Planda onaya gönderilecek imha işi yok');
    await requireActiveMember(this.db, orgId, input.approverId, PERMISSIONS.DESTRUCTION_APPROVE);
    const dueDate = input.dueDate ?? addDays(dateIn(now), DEFAULT_APPROVAL_DUE_DAYS);
    const taskId = await this.db.transaction(async (tx) => {
      const [task] = await tx
        .insert(tasks)
        .values({
          organizationId: orgId,
          type: 'approval',
          title: `Onay: ${plan.title}`,
          description: input.note ?? null,
          assigneeId: input.approverId,
          dueDate,
          reminderDays: DEFAULT_REMINDER_DAYS,
          entityType: 'destruction_plan',
          entityId: id,
          createdBy: userId,
        })
        .returning({ id: tasks.id });
      const updated = await tx
        .update(destructionPlans)
        .set({
          status: 'pending',
          approverId: input.approverId,
          approvalTaskId: task.id,
          requestedBy: userId,
          requestedAt: now,
          requestNote: input.note ?? null,
          decisionNote: null,
          decidedAt: null,
          decidedBy: null,
          updatedAt: now,
        })
        .where(and(eq(destructionPlans.id, id), ne(destructionPlans.status, 'pending')))
        .returning({ id: destructionPlans.id });
      if (updated.length === 0) throw new ConflictException('Plan zaten onay bekliyor');
      return task.id;
    });
    await this.audit.record({
      action: 'destruction.plan_approval_requested',
      organizationId: orgId,
      userId,
      entityType: 'destruction_plan',
      entityId: id,
      metadata: { approverId: input.approverId, items: planned.length },
    });
    if (input.approverId !== userId) {
      await this.notifications.notify({
        organizationId: orgId,
        userId: input.approverId,
        kind: 'approval_requested',
        title: `Onay talebi: ${plan.title}`,
        body:
          `"${plan.title}" imha planı (${planned.length} imha işi) için onayınız isteniyor.\n` +
          `Son tarih: ${formatDate(dueDate)}\n` +
          (input.note ? `Not: ${input.note}\n` : ''),
        taskId,
      });
    }
    return this.getPlan(orgId, id);
  }

  /** Onaylanan planın her imha işi için planlanan tarihte son günü olan hatırlatma görevi açılır. */
  async approve(orgId: string, userId: string, id: string, note?: string | null, now = new Date()) {
    const plan = await this.decide(orgId, userId, id, 'approved', note, now);
    const assigneeId = plan.requestedBy && (await findActiveMember(this.db, orgId, plan.requestedBy)) ? plan.requestedBy : userId;
    const items = await this.db
      .select()
      .from(destructionItems)
      .where(and(eq(destructionItems.planId, id), eq(destructionItems.status, 'planned')));
    for (const item of items) {
      if (item.taskId) {
        const reopened = await this.db
          .update(tasks)
          .set({ dueDate: item.plannedDate, updatedAt: now })
          .where(and(eq(tasks.id, item.taskId), eq(tasks.status, 'open')))
          .returning({ id: tasks.id });
        if (reopened.length > 0) continue;
      }
      const [task] = await this.db
        .insert(tasks)
        .values({
          organizationId: orgId,
          type: 'data_destruction',
          title: `İmha: ${item.dataDescription}`.slice(0, 300),
          description: `${plan.title}${item.officerName ? `\nİmha sorumlusu: ${item.officerName}` : ''}`,
          assigneeId,
          dueDate: item.plannedDate,
          reminderDays: DEFAULT_REMINDER_DAYS,
          entityType: 'destruction_item',
          entityId: item.id,
          createdBy: userId,
        })
        .returning({ id: tasks.id });
      await this.db.update(destructionItems).set({ taskId: task.id }).where(eq(destructionItems.id, item.id));
    }
    return this.getPlan(orgId, id);
  }

  async reject(orgId: string, userId: string, id: string, note: string, now = new Date()) {
    await this.decide(orgId, userId, id, 'rejected', note, now);
    return this.getPlan(orgId, id);
  }

  /** Sorumlu bekleyen onay talebini geri çeker; plan taslağa döner. */
  async withdraw(orgId: string, userId: string, id: string, now = new Date()) {
    const plan = await this.findPlan(orgId, id);
    if (plan.status !== 'pending') throw new ConflictException('Plan onay beklemiyor');
    await this.db.transaction(async (tx) => {
      await tx.update(destructionPlans).set({ status: 'draft', updatedAt: now }).where(eq(destructionPlans.id, id));
      if (plan.approvalTaskId) await this.closeTask(tx, plan.approvalTaskId, 'cancelled');
    });
    await this.audit.record({
      action: 'destruction.plan_approval_cancelled',
      organizationId: orgId,
      userId,
      entityType: 'destruction_plan',
      entityId: id,
    });
    return this.getPlan(orgId, id);
  }

  private async decide(
    orgId: string,
    userId: string,
    id: string,
    status: 'approved' | 'rejected',
    note: string | null | undefined,
    now: Date,
  ) {
    const existing = await this.findPlan(orgId, id);
    if (existing.status !== 'pending') throw new ConflictException('Plan onay beklemiyor');
    if (existing.approverId !== userId) {
      throw new ForbiddenException('Bu planı yalnızca seçilen onaylayıcı karara bağlayabilir');
    }
    const [plan] = await this.db
      .update(destructionPlans)
      .set({ status, decisionNote: note ?? null, decidedAt: now, decidedBy: userId, updatedAt: now })
      .where(and(eq(destructionPlans.id, id), eq(destructionPlans.status, 'pending')))
      .returning();
    if (!plan) throw new ConflictException('Plan onay beklemiyor');
    if (plan.approvalTaskId) await this.closeTask(this.db, plan.approvalTaskId, 'done', userId, note ?? null);
    await this.audit.record({
      action: `destruction.plan_${status}`,
      organizationId: orgId,
      userId,
      entityType: 'destruction_plan',
      entityId: id,
      metadata: note ? { note } : undefined,
    });
    if (plan.requestedBy && plan.requestedBy !== userId) {
      const result = status === 'approved' ? 'onaylandı' : 'reddedildi';
      await this.notifications.notify({
        organizationId: orgId,
        userId: plan.requestedBy,
        kind: 'approval_decided',
        title: `İmha planı ${result}: ${plan.title}`,
        body: `"${plan.title}" imha planı için onay talebiniz ${result}.\n` + (note ? `Not: ${note}\n` : ''),
        taskId: plan.approvalTaskId,
      });
    }
    return plan;
  }

  // ---- Yardımcılar ----

  /** Onay bekleyen planın içeriği değiştirilemez (Yönetici gönderilen hali onaylar). */
  private assertEditable(plan: Plan) {
    if (plan.status === 'pending') {
      throw new ConflictException('Plan onay beklerken değiştirilemez; değiştirmek için onay talebini geri çekin');
    }
  }

  private backToDraft(plan: Plan): Partial<Plan> {
    return plan.status === 'approved' || plan.status === 'rejected' ? { status: 'draft' } : {};
  }

  /** Onaylı veya reddedilmiş planın içeriği değişince plan yeniden onaya gönderilmek üzere taslağa döner. */
  private async planningChanged(plan: Plan) {
    const set = this.backToDraft(plan);
    if (set.status) {
      await this.db.update(destructionPlans).set({ ...set, updatedAt: new Date() }).where(eq(destructionPlans.id, plan.id));
    }
  }

  private async closeTask(
    db: Pick<Database, 'update'>,
    taskId: string,
    status: 'done' | 'cancelled',
    userId?: string,
    note?: string | null,
  ) {
    const now = new Date();
    await db
      .update(tasks)
      .set(
        status === 'done'
          ? { status, completedAt: now, completedBy: userId ?? null, completionNote: note ?? null, updatedAt: now }
          : { status, updatedAt: now },
      )
      .where(and(eq(tasks.id, taskId), eq(tasks.status, 'open')));
  }

  private async entryDefaults(orgId: string, entryId: string | null | undefined) {
    if (!entryId) return null;
    const [entry] = await this.db
      .select()
      .from(inventoryEntries)
      .where(and(eq(inventoryEntries.id, entryId), eq(inventoryEntries.organizationId, orgId)));
    if (!entry) throw new BadRequestException('Seçilen envanter satırı bulunamadı');
    return {
      dataDescription: describeEntry(entry),
      storageMedium: entry.storageMedium,
      retentionPeriod: entry.retentionPeriod,
    };
  }

  /** Verilen günü kapsayan dönemin imha sorumlusu; yoksa güncel sorumlu. */
  private async officerAt(orgId: string, day: IsoDate) {
    const rows = await this.db
      .select()
      .from(destructionOfficers)
      .where(eq(destructionOfficers.organizationId, orgId))
      .orderBy(desc(destructionOfficers.startDate));
    return (
      rows.find((o) => o.startDate <= day && (!o.endDate || o.endDate >= day)) ?? rows.find((o) => !o.endDate) ?? null
    );
  }

  /** Seçilen sorumlu; seçilmediyse o günü kapsayan dönemin sorumlusu. */
  private async resolveOfficer(orgId: string, officerId: string | null | undefined, day: IsoDate) {
    return officerId ? this.findOfficer(orgId, officerId) : this.officerAt(orgId, day);
  }

  private async officerName(orgId: string, employeeId: string | null | undefined, fullName: string | undefined) {
    if (!employeeId) {
      if (!fullName) throw new BadRequestException('Ad soyad girin veya çalışan seçin');
      return fullName;
    }
    const [employee] = await this.db
      .select({ firstName: employees.firstName, lastName: employees.lastName })
      .from(employees)
      .where(and(eq(employees.id, employeeId), eq(employees.organizationId, orgId)));
    if (!employee) throw new BadRequestException('Seçilen çalışan bulunamadı');
    return `${employee.firstName} ${employee.lastName}`;
  }

  private checkPeriod(start: IsoDate, end: IsoDate | null) {
    if (end && end < start) {
      throw new BadRequestException({
        message: 'Bitiş tarihi başlangıç tarihinden önce olamaz',
        errors: [{ path: 'endDate', message: 'Başlangıç tarihinden önce olamaz' }],
      });
    }
  }

  private checkPlanPeriod(start: IsoDate, end: IsoDate) {
    if (end < start) {
      throw new BadRequestException({
        message: 'Dönem bitişi başlangıçtan önce olamaz',
        errors: [{ path: 'periodEnd', message: 'Başlangıç tarihinden önce olamaz' }],
      });
    }
  }

  private checkOverlap(others: Officer[], period: Pick<Officer, 'startDate' | 'endDate'>) {
    const clash = others.find((o) => overlaps(o, period));
    if (clash) {
      throw new BadRequestException({
        message: `Bu dönem ${clash.fullName} adlı sorumlunun dönemiyle çakışıyor (${formatDate(clash.startDate)} – ${
          clash.endDate ? formatDate(clash.endDate) : 'devam ediyor'
        })`,
        errors: [{ path: 'startDate', message: 'Başka bir sorumlunun dönemiyle çakışıyor' }],
      });
    }
    if (!period.endDate && others.some((o) => !o.endDate)) {
      throw new BadRequestException('Aynı anda yalnızca bir güncel imha sorumlusu olabilir');
    }
  }

  private async findOfficer(orgId: string, id: string) {
    const [officer] = await this.db
      .select()
      .from(destructionOfficers)
      .where(and(eq(destructionOfficers.id, id), eq(destructionOfficers.organizationId, orgId)));
    if (!officer) throw new NotFoundException('İmha sorumlusu bulunamadı');
    return officer;
  }

  private async findPlan(orgId: string, id: string) {
    const [plan] = await this.db
      .select()
      .from(destructionPlans)
      .where(and(eq(destructionPlans.id, id), eq(destructionPlans.organizationId, orgId)));
    if (!plan) throw new NotFoundException('İmha planı bulunamadı');
    return plan;
  }

  private async findItem(orgId: string, id: string) {
    const [row] = await this.db
      .select({ item: destructionItems, plan: destructionPlans })
      .from(destructionItems)
      .innerJoin(destructionPlans, eq(destructionPlans.id, destructionItems.planId))
      .where(and(eq(destructionItems.id, id), eq(destructionItems.organizationId, orgId)));
    if (!row) throw new NotFoundException('Planlanan imha bulunamadı');
    return row;
  }

  async getItem(orgId: string, id: string) {
    return (await this.findItem(orgId, id)).item;
  }

  private async findRecord(orgId: string, id: string) {
    const [record] = await this.db
      .select()
      .from(destructionRecords)
      .where(and(eq(destructionRecords.id, id), eq(destructionRecords.organizationId, orgId)));
    if (!record) throw new NotFoundException('İmha kaydı bulunamadı');
    return record;
  }
}
