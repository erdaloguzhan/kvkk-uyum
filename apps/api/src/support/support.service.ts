import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  PERMISSIONS,
  Permission,
  SUPPORT_ATTACHMENT_MAX_BYTES,
  SUPPORT_ATTACHMENT_MAX_FILES,
  SUPPORT_ATTACHMENT_MIME_TYPES,
  SupportCategory,
  SupportStatus,
} from '@kvkk/shared';
import { and, asc, desc, eq, inArray, isNull, SQL, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { AuditService } from '../audit/audit.service';
import { MailerService } from '../auth/mailer.service';
import { AppConfig, CONFIG } from '../config';
import { Database, InjectDb } from '../db/db.module';
import { memberships, organizations, roles, supportAttachments, supportMessages, supportTickets, users } from '../db/schema';
import { salutation } from '../auth/account-label';

export interface UploadedAttachment {
  fileName: string;
  mimeType: string;
  content: Buffer;
}

export interface NewTicketInput {
  subject: string;
  category: SupportCategory;
  body: string;
}

export interface AdminTicketFilter {
  status?: SupportStatus;
  /** "me": bana atananlar, "none": atanmamış, ya da sorumlunun kimliği. */
  assignee?: string;
  organizationId?: string;
  /** Konu, kuruluş adı veya talep numarasında arar. */
  q?: string;
}

type TicketRow = typeof supportTickets.$inferSelect;

/** Dosyanın gerçek türü ilk baytlarından kontrol edilir (uzantıya/beyana güvenilmez). */
const SIGNATURES: Record<(typeof SUPPORT_ATTACHMENT_MIME_TYPES)[number], (b: Buffer) => boolean> = {
  'image/png': (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/gif': (b) => b.subarray(0, 4).toString('latin1') === 'GIF8',
  'image/webp': (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
  'application/pdf': (b) => b.subarray(0, 5).toString('latin1') === '%PDF-',
};

function detectType(content: Buffer) {
  return SUPPORT_ATTACHMENT_MIME_TYPES.find((t) => SIGNATURES[t](content)) ?? null;
}

const creator = alias(users, 'creator');
const assignee = alias(users, 'assignee');

@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);

  constructor(
    @InjectDb() private readonly db: Database,
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly mailer: MailerService,
    private readonly audit: AuditService,
  ) {}

  // -------------------------------------------------------------------------------------------
  // Kuruluş kullanıcısı
  // -------------------------------------------------------------------------------------------

  /** Kullanıcı kendi açtığı talepleri; KVKK Sorumlusu (org.manage) kuruluşun tüm taleplerini görür. */
  async listForUser(orgId: string, userId: string, permissions: Permission[], status?: SupportStatus) {
    const conditions: SQL[] = [eq(supportTickets.organizationId, orgId)];
    if (!permissions.includes(PERMISSIONS.ORG_MANAGE)) conditions.push(eq(supportTickets.createdBy, userId));
    if (status) conditions.push(eq(supportTickets.status, status));
    return this.selectTickets(and(...conditions)!);
  }

  async create(orgId: string, userId: string, input: NewTicketInput, files: UploadedAttachment[]) {
    const checked = this.checkFiles(files);
    const ticket = await this.db.transaction(async (tx) => {
      const [t] = await tx
        .insert(supportTickets)
        .values({ organizationId: orgId, createdBy: userId, subject: input.subject, category: input.category })
        .returning();
      await this.insertMessage(tx, t.id, userId, false, input.body, checked);
      return t;
    });
    await this.audit.record({
      action: 'support.ticket_created',
      organizationId: orgId,
      userId,
      entityType: 'support_ticket',
      entityId: ticket.id,
      metadata: { number: ticket.number, category: ticket.category },
    });
    await this.notifyStaff(ticket, `Yeni destek talebi #${ticket.number}`, 'Yeni bir destek talebi açıldı.');
    return this.getForUser(userId, ticket.id);
  }

  async getForUser(userId: string, id: string) {
    const ticket = await this.findForUser(userId, id);
    return this.detail(ticket.id);
  }

  /** Kullanıcının yanıtı. Talep destek ekibinin yanıtını bekler duruma geçer (kapalıysa yeniden açılır). */
  async replyAsUser(userId: string, id: string, body: string, files: UploadedAttachment[]) {
    const ticket = await this.findForUser(userId, id);
    const checked = this.checkFiles(files);
    await this.db.transaction(async (tx) => {
      await this.insertMessage(tx, ticket.id, userId, false, body, checked);
      await tx
        .update(supportTickets)
        .set({ status: 'open', closedAt: null, lastMessageAt: new Date() })
        .where(eq(supportTickets.id, ticket.id));
    });
    if (ticket.status === 'closed') await this.recordStatus(ticket, userId, 'open');
    await this.notifyStaff(ticket, `Destek talebine yanıt geldi #${ticket.number}`, 'Kullanıcı destek talebine yanıt yazdı.');
    return this.detail(ticket.id);
  }

  async closeAsUser(userId: string, id: string) {
    const ticket = await this.findForUser(userId, id);
    if (ticket.status !== 'closed') {
      await this.db
        .update(supportTickets)
        .set({ status: 'closed', closedAt: new Date() })
        .where(eq(supportTickets.id, ticket.id));
      await this.recordStatus(ticket, userId, 'closed');
    }
    return this.detail(ticket.id);
  }

  /**
   * Ek dosyası. Talebi gören kullanıcılar ve platform yöneticileri indirebilir. Kuruluş başlığı istenmez;
   * böylece yazışmadaki görseller doğrudan <img> ile gösterilebilir.
   */
  async attachment(userId: string, attachmentId: string) {
    const [row] = await this.db
      .select({ attachment: supportAttachments, ticketId: supportMessages.ticketId })
      .from(supportAttachments)
      .innerJoin(supportMessages, eq(supportMessages.id, supportAttachments.messageId))
      .where(eq(supportAttachments.id, attachmentId));
    if (!row) throw new NotFoundException('Dosya bulunamadı');
    if (!(await this.isPlatformAdmin(userId))) await this.findForUser(userId, row.ticketId);
    return row.attachment;
  }

  // -------------------------------------------------------------------------------------------
  // Destek ekibi (platform yöneticileri)
  // -------------------------------------------------------------------------------------------

  async adminList(userId: string, filter: AdminTicketFilter) {
    const conditions: SQL[] = [];
    if (filter.status) conditions.push(eq(supportTickets.status, filter.status));
    if (filter.assignee === 'me') conditions.push(eq(supportTickets.assigneeId, userId));
    else if (filter.assignee === 'none') conditions.push(isNull(supportTickets.assigneeId));
    else if (filter.assignee) conditions.push(eq(supportTickets.assigneeId, filter.assignee));
    if (filter.organizationId) conditions.push(eq(supportTickets.organizationId, filter.organizationId));
    let items = await this.selectTickets(conditions.length ? and(...conditions)! : undefined);
    if (filter.q) {
      const q = filter.q.toLocaleLowerCase('tr-TR').replace(/^#/, '');
      items = items.filter(
        (t) =>
          String(t.number) === q ||
          [t.subject, t.organizationName, t.createdByName].some((v) => v?.toLocaleLowerCase('tr-TR').includes(q)),
      );
    }
    return items;
  }

  /** Yönetim paneli menüsündeki sayılar. */
  async adminSummary(userId: string) {
    const [row] = await this.db
      .select({
        open: sql<number>`count(*) filter (where ${supportTickets.status} = 'open')::int`,
        unassigned: sql<number>`count(*) filter (where ${supportTickets.status} <> 'closed' and ${supportTickets.assigneeId} is null)::int`,
        mine: sql<number>`count(*) filter (where ${supportTickets.status} = 'open' and ${supportTickets.assigneeId} = ${userId})::int`,
      })
      .from(supportTickets);
    return row;
  }

  async adminGet(id: string) {
    await this.find(id);
    return this.detail(id);
  }

  /** Destek ekibinin yanıtı. Talep kullanıcının dönüşünü bekler duruma geçer; kullanıcıya e-posta gider. */
  async replyAsStaff(userId: string, id: string, body: string, files: UploadedAttachment[], close = false) {
    const ticket = await this.find(id);
    const checked = this.checkFiles(files);
    const now = new Date();
    const status: SupportStatus = close ? 'closed' : 'answered';
    await this.db.transaction(async (tx) => {
      await this.insertMessage(tx, ticket.id, userId, true, body, checked);
      await tx
        .update(supportTickets)
        .set({
          status,
          closedAt: close ? now : null,
          lastMessageAt: now,
          firstResponseAt: ticket.firstResponseAt ?? now,
          // Sorumlusu olmayan talebi yanıtlayan kişi sorumlu olur.
          assigneeId: ticket.assigneeId ?? userId,
        })
        .where(eq(supportTickets.id, ticket.id));
    });
    if (close || ticket.status === 'closed') await this.recordStatus(ticket, userId, status);
    if (!ticket.assigneeId) {
      await this.audit.record({
        action: 'support.ticket_assigned',
        organizationId: ticket.organizationId,
        userId,
        entityType: 'support_ticket',
        entityId: ticket.id,
        metadata: { number: ticket.number, assigneeId: userId },
      });
    }
    await this.notifyCreator(
      ticket,
      `Destek talebiniz yanıtlandı #${ticket.number}`,
      close ? 'Destek ekibi talebinizi yanıtladı ve kapattı.' : 'Destek ekibi talebinizi yanıtladı.',
    );
    return this.detail(ticket.id);
  }

  async adminUpdate(userId: string, id: string, input: { assigneeId?: string | null; status?: SupportStatus }) {
    const ticket = await this.find(id);
    const set: Partial<TicketRow> = {};
    if (input.assigneeId !== undefined && input.assigneeId !== ticket.assigneeId) {
      if (input.assigneeId && !(await this.isPlatformAdmin(input.assigneeId))) {
        throw new BadRequestException('Sorumlu yalnızca bir platform yöneticisi olabilir');
      }
      set.assigneeId = input.assigneeId;
    }
    if (input.status && input.status !== ticket.status) {
      set.status = input.status;
      set.closedAt = input.status === 'closed' ? new Date() : null;
    }
    if (Object.keys(set).length === 0) return this.detail(id);
    await this.db.update(supportTickets).set(set).where(eq(supportTickets.id, id));

    if (set.assigneeId !== undefined) {
      await this.audit.record({
        action: 'support.ticket_assigned',
        organizationId: ticket.organizationId,
        userId,
        entityType: 'support_ticket',
        entityId: id,
        metadata: { number: ticket.number, assigneeId: set.assigneeId },
      });
      if (set.assigneeId && set.assigneeId !== userId) {
        await this.mailUser(
          set.assigneeId,
          `Destek talebi size atandı #${ticket.number}`,
          `"${ticket.subject}" konulu destek talebi size atandı.\n\nTalebi görüntüleyin: ${this.config.appUrl}/admin/destek/${id}\n`,
        );
      }
    }
    if (set.status) {
      await this.recordStatus(ticket, userId, set.status);
      if (set.status === 'closed') {
        await this.notifyCreator(ticket, `Destek talebiniz kapatıldı #${ticket.number}`, 'Destek talebiniz kapatıldı.');
      }
    }
    return this.detail(id);
  }

  /** Sorumlu olarak atanabilecek kişiler. */
  staff() {
    return this.db
      .select({ id: users.id, fullName: users.fullName, email: users.email })
      .from(users)
      .where(and(eq(users.isPlatformAdmin, true), eq(users.isActive, true)))
      .orderBy(users.fullName);
  }

  // -------------------------------------------------------------------------------------------

  private selectTickets(where: SQL | undefined) {
    return this.db
      .select({
        id: supportTickets.id,
        number: supportTickets.number,
        organizationId: supportTickets.organizationId,
        organizationName: organizations.name,
        subject: supportTickets.subject,
        category: supportTickets.category,
        status: supportTickets.status,
        createdBy: supportTickets.createdBy,
        createdByName: creator.fullName,
        assigneeId: supportTickets.assigneeId,
        assigneeName: assignee.fullName,
        firstResponseAt: supportTickets.firstResponseAt,
        lastMessageAt: supportTickets.lastMessageAt,
        closedAt: supportTickets.closedAt,
        createdAt: supportTickets.createdAt,
        messageCount: sql<number>`(select count(*)::int from ${supportMessages} where ${supportMessages.ticketId} = ${supportTickets.id})`,
      })
      .from(supportTickets)
      .innerJoin(organizations, eq(organizations.id, supportTickets.organizationId))
      .leftJoin(creator, eq(creator.id, supportTickets.createdBy))
      .leftJoin(assignee, eq(assignee.id, supportTickets.assigneeId))
      .where(where)
      .orderBy(desc(supportTickets.lastMessageAt));
  }

  private async detail(id: string) {
    const [ticket] = await this.selectTickets(eq(supportTickets.id, id));
    const [creatorEmail] = ticket.createdBy
      ? await this.db.select({ email: users.email }).from(users).where(eq(users.id, ticket.createdBy))
      : [];
    const messages = await this.db
      .select({
        id: supportMessages.id,
        authorId: supportMessages.authorId,
        authorName: users.fullName,
        isStaff: supportMessages.isStaff,
        body: supportMessages.body,
        createdAt: supportMessages.createdAt,
      })
      .from(supportMessages)
      .leftJoin(users, eq(users.id, supportMessages.authorId))
      .where(eq(supportMessages.ticketId, id))
      .orderBy(asc(supportMessages.createdAt));
    const attachments = messages.length
      ? await this.db
          .select({
            id: supportAttachments.id,
            messageId: supportAttachments.messageId,
            fileName: supportAttachments.fileName,
            mimeType: supportAttachments.mimeType,
            size: supportAttachments.size,
          })
          .from(supportAttachments)
          .where(inArray(supportAttachments.messageId, messages.map((m) => m.id)))
          .orderBy(asc(supportAttachments.createdAt))
      : [];
    return {
      ...ticket,
      createdByEmail: creatorEmail?.email ?? null,
      messages: messages.map((m) => ({ ...m, attachments: attachments.filter((a) => a.messageId === m.id) })),
    };
  }

  private async insertMessage(
    tx: Pick<Database, 'insert'>,
    ticketId: string,
    authorId: string,
    isStaff: boolean,
    body: string,
    files: (UploadedAttachment & { mimeType: string })[],
  ) {
    const [message] = await tx.insert(supportMessages).values({ ticketId, authorId, isStaff, body }).returning();
    if (files.length) {
      await tx.insert(supportAttachments).values(
        files.map((f) => ({
          messageId: message.id,
          fileName: f.fileName,
          mimeType: f.mimeType,
          size: f.content.length,
          content: f.content,
        })),
      );
    }
    return message;
  }

  private checkFiles(files: UploadedAttachment[]) {
    if (files.length > SUPPORT_ATTACHMENT_MAX_FILES) {
      throw new BadRequestException(`En fazla ${SUPPORT_ATTACHMENT_MAX_FILES} dosya eklenebilir`);
    }
    return files.map((f) => {
      if (f.content.length > SUPPORT_ATTACHMENT_MAX_BYTES) {
        throw new BadRequestException(`${f.fileName}: dosya en fazla 5 MB olabilir`);
      }
      const mimeType = detectType(f.content);
      if (!mimeType) throw new BadRequestException(`${f.fileName}: yalnızca PNG, JPEG, WEBP, GIF görsel veya PDF eklenebilir`);
      return { ...f, fileName: f.fileName.slice(0, 200), mimeType };
    });
  }

  private async find(id: string) {
    const [ticket] = await this.db.select().from(supportTickets).where(eq(supportTickets.id, id));
    if (!ticket) throw new NotFoundException('Destek talebi bulunamadı');
    return ticket;
  }

  /**
   * Kullanıcının erişebildiği talep: kuruluşta hâlâ aktif üye olmalı ve talebi kendisi açmış ya da
   * KVKK Sorumlusu (org.manage) olmalı. Erişemediği talep "bulunamadı" görünür.
   */
  private async findForUser(userId: string, id: string) {
    const [row] = await this.db
      .select({ ticket: supportTickets, permissions: roles.permissions })
      .from(supportTickets)
      .innerJoin(
        memberships,
        and(
          eq(memberships.organizationId, supportTickets.organizationId),
          eq(memberships.userId, userId),
          eq(memberships.status, 'active'),
        ),
      )
      .innerJoin(roles, eq(roles.id, memberships.roleId))
      .where(eq(supportTickets.id, id));
    const allowed =
      row && (row.ticket.createdBy === userId || (row.permissions as Permission[]).includes(PERMISSIONS.ORG_MANAGE));
    if (!allowed) throw new NotFoundException('Destek talebi bulunamadı');
    return row.ticket;
  }

  private async isPlatformAdmin(userId: string) {
    const [u] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, userId), eq(users.isPlatformAdmin, true), eq(users.isActive, true)));
    return !!u;
  }

  private recordStatus(ticket: TicketRow, userId: string, status: SupportStatus) {
    return this.audit.record({
      action: 'support.ticket_status_changed',
      organizationId: ticket.organizationId,
      userId,
      entityType: 'support_ticket',
      entityId: ticket.id,
      metadata: { number: ticket.number, from: ticket.status, to: status },
    });
  }

  /*
   * E-postalarda yazışmanın kendisi gönderilmez (kişisel veri içerebilir); yalnızca talep konusu ve bağlantı
   * gider, içerik sisteme girişle okunur.
   */

  /** Sorumluya; sorumlu yoksa tüm platform yöneticilerine. */
  private async notifyStaff(ticket: TicketRow, subject: string, intro: string) {
    const [org] = await this.db
      .select({ name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, ticket.organizationId));
    const recipients = ticket.assigneeId ? [ticket.assigneeId] : (await this.staff()).map((s) => s.id);
    const text =
      `${intro}\n\nKuruluş: ${org?.name ?? '-'}\nKonu: ${ticket.subject}\n\n` +
      `Talebi görüntüleyin: ${this.config.appUrl}/admin/destek/${ticket.id}\n`;
    for (const id of recipients) await this.mailUser(id, subject, text);
  }

  private async notifyCreator(ticket: TicketRow, subject: string, intro: string) {
    if (!ticket.createdBy) return;
    await this.mailUser(
      ticket.createdBy,
      subject,
      `${intro}\n\nKonu: ${ticket.subject}\n\n` +
        `Yanıtı okumak için: ${this.config.appUrl}/destek/${ticket.id}\n`,
    );
  }

  /** Talep kaydedildikten sonra gönderilir; e-posta hatası kullanıcının işlemini bozmaz. */
  private async mailUser(userId: string, subject: string, text: string) {
    const [user] = await this.db
      .select({ email: users.email, fullName: users.fullName, isActive: users.isActive })
      .from(users)
      .where(eq(users.id, userId));
    if (!user?.isActive) return;
    try {
      await this.mailer.send({ to: user.email, subject, text: `${salutation(user.fullName)}\n\n${text}` });
    } catch (err) {
      this.logger.error(`Destek e-postası gönderilemedi: ${subject}`, err as Error);
    }
  }
}
