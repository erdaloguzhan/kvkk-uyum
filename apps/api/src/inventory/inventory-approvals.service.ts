import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ApprovalStatus, DEFAULT_APPROVAL_DUE_DAYS, DEFAULT_REMINDER_DAYS, INVENTORY_COLUMNS, PERMISSIONS } from '@kvkk/shared';
import { and, asc, desc, eq, SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { AuditService } from '../audit/audit.service';
import { Database, InjectDb } from '../db/db.module';
import { InventoryChange, inventoryApprovals, inventoryEntries, InventorySnapshotEntry, tasks, users } from '../db/schema';
import { addDays, dateIn, formatDate, IsoDate } from '../workflow/dates';
import { requireActiveMember } from '../workflow/members';
import { NotificationsService } from '../workflow/notifications.service';

export interface InventoryApprovalInput {
  approverId: string;
  dueDate?: IsoDate | null;
  note?: string | null;
}

const approver = alias(users, 'approver');
const requester = alias(users, 'requester');
const decider = alias(users, 'decider');

const FIELDS = INVENTORY_COLUMNS.map((c) => c.field);

const isUniqueViolation = (err: unknown) =>
  (err as { cause?: { code?: string } })?.cause?.code === '23505' || (err as { code?: string })?.code === '23505';

const snapshotOf = (row: typeof inventoryEntries.$inferSelect): InventorySnapshotEntry => {
  const { organizationId: _o, createdBy: _cb, updatedBy: _ub, createdAt: _c, updatedAt: _u, ...entry } = row;
  return entry;
};

const label = (e: Pick<InventorySnapshotEntry, 'department' | 'activity' | 'dataCategory'>) => ({
  department: e.department,
  activity: e.activity,
  dataCategory: e.dataCategory,
});

const empty = (v: unknown) => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
const same = (a: unknown, b: unknown) => (empty(a) && empty(b)) || JSON.stringify(a) === JSON.stringify(b);

/** Son onaylanan envanter ile şimdiki envanter arasındaki farklar (eklenen, değişen, silinen satırlar). */
export function diffInventory(base: InventorySnapshotEntry[], current: InventorySnapshotEntry[]): InventoryChange[] {
  const before = new Map(base.map((e) => [e.id, e]));
  const changes: InventoryChange[] = [];
  for (const entry of current) {
    const old = before.get(entry.id);
    before.delete(entry.id);
    if (!old) {
      changes.push({ entryId: entry.id, kind: 'added', ...label(entry) });
      continue;
    }
    const fields = FIELDS.filter((f) => !same(old[f], entry[f])).map((f) => ({ field: f, before: old[f], after: entry[f] }));
    if (fields.length > 0) changes.push({ entryId: entry.id, kind: 'updated', ...label(entry), fields });
  }
  for (const old of before.values()) changes.push({ entryId: old.id, kind: 'deleted', ...label(old) });
  return changes;
}

/**
 * Veri envanteri değişikliklerinin Yönetici onayı. Değişiklikler envantere hemen yazılır; Sorumlu son onaydan
 * bu yana yapılanları onaya gönderir, Yönetici gönderilen hali onaylar veya gerekçeyle reddeder.
 * Onaydan sonra yapılan değişiklikler bir sonraki onay talebinde görünür.
 */
@Injectable()
export class InventoryApprovalsService {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Envanterin onay durumu: son onay, bekleyen talep ve henüz onaya gönderilmemiş/onaylanmamış değişiklikler. */
  async status(orgId: string) {
    const [lastApproved] = await this.select()
      .where(and(eq(inventoryApprovals.organizationId, orgId), eq(inventoryApprovals.status, 'approved')))
      .orderBy(desc(inventoryApprovals.decidedAt))
      .limit(1);
    const [pending] = await this.select().where(
      and(eq(inventoryApprovals.organizationId, orgId), eq(inventoryApprovals.status, 'pending')),
    );
    const changes = diffInventory(await this.baseSnapshot(orgId), await this.current(orgId));
    return { lastApproved: lastApproved ?? null, pending: pending ?? null, changes };
  }

  async request(orgId: string, userId: string, input: InventoryApprovalInput, now = new Date()) {
    const snapshot = await this.current(orgId);
    const changes = diffInventory(await this.baseSnapshot(orgId), snapshot);
    if (changes.length === 0) throw new ConflictException('Son onaydan bu yana envanterde değişiklik yok');
    await requireActiveMember(this.db, orgId, input.approverId, PERMISSIONS.INVENTORY_APPROVE);

    const dueDate = input.dueDate ?? addDays(dateIn(now), DEFAULT_APPROVAL_DUE_DAYS);
    let created: { id: string; taskId: string };
    try {
      created = await this.db.transaction(async (tx) => {
        const [request] = await tx
          .insert(inventoryApprovals)
          .values({
            organizationId: orgId,
            requestedBy: userId,
            approverId: input.approverId,
            note: input.note ?? null,
            snapshot,
            changes,
          })
          .returning({ id: inventoryApprovals.id });
        const [task] = await tx
          .insert(tasks)
          .values({
            organizationId: orgId,
            type: 'approval',
            title: `Onay: Veri envanteri değişiklikleri (${changes.length} satır)`,
            description: input.note ?? null,
            assigneeId: input.approverId,
            dueDate,
            reminderDays: DEFAULT_REMINDER_DAYS,
            entityType: 'inventory_approval',
            entityId: request.id,
            createdBy: userId,
          })
          .returning({ id: tasks.id });
        await tx.update(inventoryApprovals).set({ taskId: task.id }).where(eq(inventoryApprovals.id, request.id));
        return { id: request.id, taskId: task.id };
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictException('Envanter için zaten bekleyen bir onay talebi var');
      throw err;
    }
    await this.audit.record({
      action: 'inventory.approval_requested',
      organizationId: orgId,
      userId,
      entityType: 'inventory_approval',
      entityId: created.id,
      metadata: { approverId: input.approverId, changes: changes.length },
    });
    if (input.approverId !== userId) {
      await this.notifications.notify({
        organizationId: orgId,
        userId: input.approverId,
        kind: 'approval_requested',
        title: 'Onay talebi: Veri envanteri değişiklikleri',
        body:
          `Veri envanterinde ${changes.length} satırdaki değişiklik için onayınız isteniyor.\n` +
          `Son tarih: ${formatDate(dueDate)}\n` +
          (input.note ? `Not: ${input.note}\n` : ''),
        taskId: created.taskId,
      });
    }
    return this.get(orgId, created.id);
  }

  async list(orgId: string, filter: { status?: ApprovalStatus } = {}) {
    const conditions: SQL[] = [eq(inventoryApprovals.organizationId, orgId)];
    if (filter.status) conditions.push(eq(inventoryApprovals.status, filter.status));
    const rows = await this.select()
      .where(and(...conditions))
      .orderBy(desc(inventoryApprovals.createdAt));
    // Liste görünümünde satır ayrıntıları yerine yalnızca sayı döner.
    return rows.map(({ changes, ...r }) => ({ ...r, changeCount: changes.length }));
  }

  async get(orgId: string, id: string) {
    const [row] = await this.select().where(and(eq(inventoryApprovals.id, id), eq(inventoryApprovals.organizationId, orgId)));
    if (!row) throw new NotFoundException('Onay talebi bulunamadı');
    return row;
  }

  async approve(orgId: string, userId: string, id: string, note?: string | null, now = new Date()) {
    const request = await this.claim(orgId, userId, id, 'approved', note, now);
    await this.afterDecision(orgId, userId, request, 'approved', note, now);
    return this.get(orgId, id);
  }

  async reject(orgId: string, userId: string, id: string, note: string, now = new Date()) {
    const request = await this.claim(orgId, userId, id, 'rejected', note, now);
    await this.afterDecision(orgId, userId, request, 'rejected', note, now);
    return this.get(orgId, id);
  }

  async cancel(orgId: string, userId: string, id: string, now = new Date()) {
    const [request] = await this.db
      .update(inventoryApprovals)
      .set({ status: 'cancelled', decidedAt: now, decidedBy: userId })
      .where(
        and(
          eq(inventoryApprovals.id, id),
          eq(inventoryApprovals.organizationId, orgId),
          eq(inventoryApprovals.status, 'pending'),
        ),
      )
      .returning();
    if (!request) {
      await this.get(orgId, id);
      throw new ConflictException('Bu onay talebi zaten sonuçlanmış');
    }
    if (request.taskId) {
      await this.db.update(tasks).set({ status: 'cancelled', updatedAt: now }).where(eq(tasks.id, request.taskId));
    }
    await this.audit.record({
      action: 'inventory.approval_cancelled',
      organizationId: orgId,
      userId,
      entityType: 'inventory_approval',
      entityId: id,
    });
    return this.get(orgId, id);
  }

  /** Bekleyen talebi karar verilmiş olarak işaretler; kararı yalnızca seçilen onaylayıcı verir. */
  private async claim(
    orgId: string,
    userId: string,
    id: string,
    status: 'approved' | 'rejected',
    note: string | null | undefined,
    now: Date,
  ) {
    const existing = await this.get(orgId, id);
    if (existing.approver.id !== userId) {
      throw new ForbiddenException('Bu talebi yalnızca seçilen onaylayıcı karara bağlayabilir');
    }
    const [request] = await this.db
      .update(inventoryApprovals)
      .set({ status, decisionNote: note ?? null, decidedAt: now, decidedBy: userId })
      .where(and(eq(inventoryApprovals.id, id), eq(inventoryApprovals.status, 'pending')))
      .returning();
    if (!request) throw new ConflictException('Bu onay talebi zaten sonuçlanmış');
    return request;
  }

  private async afterDecision(
    orgId: string,
    userId: string,
    request: typeof inventoryApprovals.$inferSelect,
    status: 'approved' | 'rejected',
    note: string | null | undefined,
    now: Date,
  ) {
    if (request.taskId) {
      await this.db
        .update(tasks)
        .set({ status: 'done', completedAt: now, completedBy: userId, completionNote: note ?? null, updatedAt: now })
        .where(and(eq(tasks.id, request.taskId), eq(tasks.status, 'open')));
    }
    await this.audit.record({
      action: `inventory.approval_${status}`,
      organizationId: orgId,
      userId,
      entityType: 'inventory_approval',
      entityId: request.id,
      metadata: { changes: request.changes.length, ...(note ? { note } : {}) },
    });
    if (!request.requestedBy || request.requestedBy === userId) return;
    const result = status === 'approved' ? 'onaylandı' : 'reddedildi';
    await this.notifications.notify({
      organizationId: orgId,
      userId: request.requestedBy,
      kind: 'approval_decided',
      title: `Veri envanteri değişiklikleri ${result}`,
      body:
        `Veri envanterindeki ${request.changes.length} satırlık değişiklik için onay talebiniz ${result}.\n` +
        (note ? `Not: ${note}\n` : ''),
      taskId: request.taskId,
    });
  }

  /** Karşılaştırma tabanı: son onaylanan talebin envanteri; hiç onay yoksa boş envanter. */
  private async baseSnapshot(orgId: string): Promise<InventorySnapshotEntry[]> {
    const [last] = await this.db
      .select({ snapshot: inventoryApprovals.snapshot })
      .from(inventoryApprovals)
      .where(and(eq(inventoryApprovals.organizationId, orgId), eq(inventoryApprovals.status, 'approved')))
      .orderBy(desc(inventoryApprovals.decidedAt))
      .limit(1);
    return last?.snapshot ?? [];
  }

  private async current(orgId: string) {
    const rows = await this.db
      .select()
      .from(inventoryEntries)
      .where(eq(inventoryEntries.organizationId, orgId))
      .orderBy(asc(inventoryEntries.createdAt));
    return rows.map(snapshotOf);
  }

  private select() {
    return this.db
      .select({
        id: inventoryApprovals.id,
        status: inventoryApprovals.status,
        note: inventoryApprovals.note,
        decisionNote: inventoryApprovals.decisionNote,
        changes: inventoryApprovals.changes,
        decidedAt: inventoryApprovals.decidedAt,
        createdAt: inventoryApprovals.createdAt,
        taskId: inventoryApprovals.taskId,
        dueDate: tasks.dueDate,
        approver: { id: approver.id, fullName: approver.fullName },
        requestedBy: { id: requester.id, fullName: requester.fullName },
        decidedBy: { id: decider.id, fullName: decider.fullName },
      })
      .from(inventoryApprovals)
      .innerJoin(approver, eq(approver.id, inventoryApprovals.approverId))
      .leftJoin(requester, eq(requester.id, inventoryApprovals.requestedBy))
      .leftJoin(decider, eq(decider.id, inventoryApprovals.decidedBy))
      .leftJoin(tasks, eq(tasks.id, inventoryApprovals.taskId));
  }
}
