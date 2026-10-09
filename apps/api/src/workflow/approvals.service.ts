import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApprovalStatus, DEFAULT_APPROVAL_DUE_DAYS, DEFAULT_REMINDER_DAYS, PERMISSIONS } from '@kvkk/shared';
import { and, desc, eq, or, SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { AuditService } from '../audit/audit.service';
import { Database, InjectDb } from '../db/db.module';
import { approvalRequests, documents, documentVersions, tasks, users } from '../db/schema';
import { DocumentsService } from '../documents/documents.service';
import { addDays, dateIn, formatDate, IsoDate } from './dates';
import { requireActiveMember } from './members';
import { NotificationsService } from './notifications.service';

export interface ApprovalInput {
  approverId: string;
  dueDate?: IsoDate | null;
  note?: string | null;
}

/** Onay taleplerini listeleyen kişi: tümünü göremiyorsa yalnızca kendi talep ettiklerini ve onaylayacaklarını görür. */
export interface ApprovalViewer {
  userId: string;
  canReadAll: boolean;
}

const approver = alias(users, 'approver');
const requester = alias(users, 'requester');

const isUniqueViolation = (err: unknown) => (err as { cause?: { code?: string } })?.cause?.code === '23505'
  || (err as { code?: string })?.code === '23505';

@Injectable()
export class ApprovalsService {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly docs: DocumentsService,
  ) {}

  /** Taslak sürümün yayınlanması için onay ister; onaylayana son tarihli bir görev açılır. */
  async request(orgId: string, userId: string, documentId: string, versionId: string, input: ApprovalInput, now = new Date()) {
    const [version] = await this.db
      .select({
        versionNo: documentVersions.versionNo,
        status: documentVersions.status,
        code: documents.code,
        title: documents.title,
      })
      .from(documentVersions)
      .innerJoin(documents, eq(documents.id, documentVersions.documentId))
      .where(
        and(eq(documentVersions.id, versionId), eq(documents.id, documentId), eq(documents.organizationId, orgId)),
      );
    if (!version) throw new NotFoundException('Sürüm bulunamadı');
    if (version.status !== 'draft') throw new ConflictException('Yalnızca taslak sürüm için onay istenebilir');
    await requireActiveMember(this.db, orgId, input.approverId, PERMISSIONS.DOCUMENTS_APPROVE);

    const dueDate = input.dueDate ?? addDays(dateIn(now), DEFAULT_APPROVAL_DUE_DAYS);
    const label = `${version.code} ${version.title} (sürüm ${version.versionNo})`;
    let created: { id: string; taskId: string };
    try {
      created = await this.db.transaction(async (tx) => {
        const [task] = await tx
          .insert(tasks)
          .values({
            organizationId: orgId,
            type: 'approval',
            title: `Onay: ${label}`,
            description: input.note ?? null,
            assigneeId: input.approverId,
            dueDate,
            reminderDays: DEFAULT_REMINDER_DAYS,
            entityType: 'document',
            entityId: documentId,
            createdBy: userId,
          })
          .returning({ id: tasks.id });
        const [request] = await tx
          .insert(approvalRequests)
          .values({
            organizationId: orgId,
            documentId,
            versionId,
            taskId: task.id,
            requestedBy: userId,
            approverId: input.approverId,
            note: input.note ?? null,
          })
          .returning({ id: approvalRequests.id });
        return { id: request.id, taskId: task.id };
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictException('Bu sürüm için zaten bekleyen bir onay talebi var');
      throw err;
    }
    await this.audit.record({
      action: 'approval.requested',
      organizationId: orgId,
      userId,
      entityType: 'document',
      entityId: documentId,
      metadata: { approvalRequestId: created.id, versionId, approverId: input.approverId },
    });
    if (input.approverId !== userId) {
      await this.notifications.notify({
        organizationId: orgId,
        userId: input.approverId,
        kind: 'approval_requested',
        title: `Onay talebi: ${label}`,
        body:
          `${label} dokümanının yayınlanması için onayınız isteniyor.\nSon tarih: ${formatDate(dueDate)}\n` +
          (input.note ? `Not: ${input.note}\n` : ''),
        taskId: created.taskId,
        approvalRequestId: created.id,
      });
    }
    return this.get(orgId, { userId, canReadAll: true }, created.id);
  }

  async list(orgId: string, viewer: ApprovalViewer, filter: { status?: ApprovalStatus; documentId?: string } = {}) {
    const conditions: SQL[] = [eq(approvalRequests.organizationId, orgId)];
    if (!viewer.canReadAll) {
      conditions.push(
        or(eq(approvalRequests.approverId, viewer.userId), eq(approvalRequests.requestedBy, viewer.userId))!,
      );
    }
    if (filter.status) conditions.push(eq(approvalRequests.status, filter.status));
    if (filter.documentId) conditions.push(eq(approvalRequests.documentId, filter.documentId));
    return this.select()
      .where(and(...conditions))
      .orderBy(desc(approvalRequests.createdAt));
  }

  async get(orgId: string, viewer: ApprovalViewer, id: string) {
    const [row] = await this.select().where(and(eq(approvalRequests.id, id), eq(approvalRequests.organizationId, orgId)));
    if (!row || !(viewer.canReadAll || row.approver.id === viewer.userId || row.requestedBy?.id === viewer.userId)) {
      throw new NotFoundException('Onay talebi bulunamadı');
    }
    return row;
  }

  /** Onaylayan kişi onaylarsa sürüm yayınlanır ve onay görevi kapanır. */
  async approve(orgId: string, userId: string, id: string, note?: string | null, now = new Date()) {
    const request = await this.claim(orgId, userId, id, 'approved', note, now);
    try {
      await this.docs.publish(orgId, userId, request.documentId, request.versionId);
    } catch (err) {
      // Sürüm bu arada başka yoldan yayınlandı veya daha yeni bir sürüm yayına girdi: talep geçersizdir.
      const stale = err instanceof ConflictException || err instanceof NotFoundException;
      await this.db
        .update(approvalRequests)
        .set(stale ? { status: 'cancelled' } : { status: 'pending', decidedAt: null, decidedBy: null, decisionNote: null })
        .where(eq(approvalRequests.id, id));
      if (stale && request.taskId) {
        await this.db.update(tasks).set({ status: 'cancelled', updatedAt: now }).where(eq(tasks.id, request.taskId));
      }
      throw err;
    }
    await this.closeTask(request.taskId, userId, note, now);
    await this.afterDecision(orgId, userId, request, 'approved', note);
    return this.get(orgId, { userId, canReadAll: true }, id);
  }

  async reject(orgId: string, userId: string, id: string, note: string, now = new Date()) {
    const request = await this.claim(orgId, userId, id, 'rejected', note, now);
    await this.closeTask(request.taskId, userId, note, now);
    await this.afterDecision(orgId, userId, request, 'rejected', note);
    return this.get(orgId, { userId, canReadAll: true }, id);
  }

  async cancel(orgId: string, userId: string, id: string, now = new Date()) {
    const [request] = await this.db
      .update(approvalRequests)
      .set({ status: 'cancelled', decidedAt: now, decidedBy: userId })
      .where(
        and(eq(approvalRequests.id, id), eq(approvalRequests.organizationId, orgId), eq(approvalRequests.status, 'pending')),
      )
      .returning();
    if (!request) return this.throwNotPending(orgId, id);
    if (request.taskId) {
      await this.db.update(tasks).set({ status: 'cancelled', updatedAt: now }).where(eq(tasks.id, request.taskId));
    }
    await this.audit.record({
      action: 'approval.cancelled',
      organizationId: orgId,
      userId,
      entityType: 'document',
      entityId: request.documentId,
      metadata: { approvalRequestId: id },
    });
    return this.get(orgId, { userId, canReadAll: true }, id);
  }

  /** Bekleyen talebi karar verilmiş olarak işaretler; aynı anda iki karar verilemez. */
  private async claim(
    orgId: string,
    userId: string,
    id: string,
    status: 'approved' | 'rejected',
    note: string | null | undefined,
    now: Date,
  ) {
    const [existing] = await this.db
      .select({ approverId: approvalRequests.approverId })
      .from(approvalRequests)
      .where(and(eq(approvalRequests.id, id), eq(approvalRequests.organizationId, orgId)));
    if (!existing) throw new NotFoundException('Onay talebi bulunamadı');
    if (existing.approverId !== userId) throw new ForbiddenException('Bu talebi yalnızca seçilen onaylayıcı karara bağlayabilir');
    const [request] = await this.db
      .update(approvalRequests)
      .set({ status, decisionNote: note ?? null, decidedAt: now, decidedBy: userId })
      .where(and(eq(approvalRequests.id, id), eq(approvalRequests.status, 'pending')))
      .returning();
    if (!request) throw new ConflictException('Bu onay talebi zaten sonuçlanmış');
    return request;
  }

  private async throwNotPending(orgId: string, id: string): Promise<never> {
    const [row] = await this.db
      .select({ id: approvalRequests.id })
      .from(approvalRequests)
      .where(and(eq(approvalRequests.id, id), eq(approvalRequests.organizationId, orgId)));
    if (!row) throw new NotFoundException('Onay talebi bulunamadı');
    throw new ConflictException('Bu onay talebi zaten sonuçlanmış');
  }

  private async closeTask(taskId: string | null, userId: string, note: string | null | undefined, now: Date) {
    if (!taskId) return;
    await this.db
      .update(tasks)
      .set({ status: 'done', completedAt: now, completedBy: userId, completionNote: note ?? null, updatedAt: now })
      .where(and(eq(tasks.id, taskId), eq(tasks.status, 'open')));
  }

  private async afterDecision(
    orgId: string,
    userId: string,
    request: typeof approvalRequests.$inferSelect,
    status: 'approved' | 'rejected',
    note: string | null | undefined,
  ) {
    await this.audit.record({
      action: `approval.${status}`,
      organizationId: orgId,
      userId,
      entityType: 'document',
      entityId: request.documentId,
      metadata: { approvalRequestId: request.id, versionId: request.versionId },
    });
    if (!request.requestedBy || request.requestedBy === userId) return;
    const [doc] = await this.db
      .select({ code: documents.code, title: documents.title, versionNo: documentVersions.versionNo })
      .from(documentVersions)
      .innerJoin(documents, eq(documents.id, documentVersions.documentId))
      .where(eq(documentVersions.id, request.versionId));
    const label = `${doc.code} ${doc.title} (sürüm ${doc.versionNo})`;
    const result = status === 'approved' ? 'onaylandı ve yayınlandı' : 'reddedildi';
    await this.notifications.notify({
      organizationId: orgId,
      userId: request.requestedBy,
      kind: 'approval_decided',
      title: `${label} ${result}`,
      body: `Onay talebiniz sonuçlandı: ${label} ${result}.\n` + (note ? `Not: ${note}\n` : ''),
      taskId: request.taskId,
      approvalRequestId: request.id,
    });
  }

  private select() {
    return this.db
      .select({
        id: approvalRequests.id,
        status: approvalRequests.status,
        note: approvalRequests.note,
        decisionNote: approvalRequests.decisionNote,
        decidedAt: approvalRequests.decidedAt,
        createdAt: approvalRequests.createdAt,
        taskId: approvalRequests.taskId,
        dueDate: tasks.dueDate,
        document: { id: documents.id, code: documents.code, title: documents.title },
        version: { id: documentVersions.id, versionNo: documentVersions.versionNo, status: documentVersions.status },
        approver: { id: approver.id, fullName: approver.fullName },
        requestedBy: { id: requester.id, fullName: requester.fullName },
      })
      .from(approvalRequests)
      .innerJoin(documents, eq(documents.id, approvalRequests.documentId))
      .innerJoin(documentVersions, eq(documentVersions.id, approvalRequests.versionId))
      .innerJoin(approver, eq(approver.id, approvalRequests.approverId))
      .leftJoin(requester, eq(requester.id, approvalRequests.requestedBy))
      .leftJoin(tasks, eq(tasks.id, approvalRequests.taskId));
  }
}
