import { Injectable, NotFoundException } from '@nestjs/common';
import { eq, getTableColumns, inArray } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import ExcelJS from 'exceljs';
import PizZip from 'pizzip';
import { Database, InjectDb } from '../db/db.module';
import * as s from '../db/schema';

/** Hiçbir zaman dışa verilmeyen sütunlar (şifre özetleri, arama özetleri). */
const HIDDEN = new Set(['passwordHash', 'codeHash', 'tokenHash']);

interface Sheet {
  /** Excel sayfasının adı (en fazla 31 karakter). */
  name: string;
  table: PgTable;
  rows: Record<string, unknown>[];
}

interface ExportFile {
  path: string;
  content: Buffer;
}

const MAX_CELL = 32_000;

const safeName = (name: string) => name.replace(/[\\/:*?"<>|]/g, '_').slice(0, 120);

const README = `KVK Uyum Yönetim Sistemi - kuruluş verilerinin dışa aktarımı

veriler.xlsx: Sistemde kuruluşa ait bütün kayıtlar, her tablo ayrı bir sayfada. Sütun adları sistemdeki
alan adlarıdır; "id" ile biten sütunlar sayfalar arasındaki bağlantıları gösterir (ör. document_versions
sayfasındaki documentId, documents sayfasındaki id'ye karşılık gelir).

dokumanlar/: Dokümanların bütün sürümleri (Word).
destek-ekleri/: Destek taleplerine eklenen dosyalar.
basvuru-dosyalari/: İlgili kişi başvurularına eklenen dosyalar.

Bu dosya kişisel veri içerir. Güvenli bir yerde saklayın ve gerekmeyince silin.
`;

/**
 * Kuruluşun Sistemdeki bütün verisini tek bir ZIP dosyası olarak çıkarır (veri işleme sözleşmesi:
 * ilgili kişi başvurularında ve sözleşme bitiminde verilerin teslimi). Şifre özetleri gibi güvenlik
 * alanları dışında her sütun yazılır; başvurulardaki T.C. kimlik numaraları açık hâliyle yer alır.
 */
@Injectable()
export class OrganizationExportService {
  constructor(@InjectDb() private readonly db: Database) {}

  async build(orgId: string) {
    const [org] = await this.db.select().from(s.organizations).where(eq(s.organizations.id, orgId));
    if (!org) throw new NotFoundException('Kuruluş bulunamadı');

    const byOrg = <T extends PgTable & { organizationId: any }>(table: T) =>
      this.db.select().from(table as PgTable).where(eq(table.organizationId, orgId)) as Promise<Record<string, any>[]>;
    const byParent = (table: PgTable, column: any, ids: string[]) =>
      ids.length ? (this.db.select().from(table).where(inArray(column, ids)) as Promise<Record<string, any>[]>) : Promise.resolve([]);
    const ids = (rows: Record<string, any>[]) => rows.map((r) => r.id as string);

    const memberships = await byOrg(s.memberships);
    const users = await byParent(s.users, s.users.id, memberships.map((m) => m.userId));
    const documents = await byOrg(s.documents);
    const documentVersions = await byParent(s.documentVersions, s.documentVersions.documentId, ids(documents));
    const groups = await byOrg(s.trainingGroups);
    const participants = await byParent(s.trainingParticipants, s.trainingParticipants.groupId, ids(groups));
    const attempts = await byParent(s.trainingExamAttempts, s.trainingExamAttempts.participantId, ids(participants));
    const answers = await byParent(s.trainingExamAnswers, s.trainingExamAnswers.attemptId, ids(attempts));
    const tickets = await byOrg(s.supportTickets);
    const messages = await byParent(s.supportMessages, s.supportMessages.ticketId, ids(tickets));
    const attachments = await byParent(s.supportAttachments, s.supportAttachments.messageId, ids(messages));
    const requests = await byOrg(s.dataSubjectRequests);
    const requestFiles = await byParent(s.dataSubjectRequestFiles, s.dataSubjectRequestFiles.requestId, ids(requests));
    const requestEvents = await byParent(s.dataSubjectRequestEvents, s.dataSubjectRequestEvents.requestId, ids(requests));

    const { logo: _logo, ...orgRow } = org;
    const sheets: Sheet[] = [
      { name: 'organizations', table: s.organizations, rows: [orgRow] },
      { name: 'users', table: s.users, rows: users },
      { name: 'memberships', table: s.memberships, rows: memberships },
      { name: 'roles', table: s.roles, rows: await byOrg(s.roles) },
      { name: 'documents', table: s.documents, rows: documents },
      { name: 'document_versions', table: s.documentVersions, rows: documentVersions },
      { name: 'document_reads', table: s.documentReads, rows: await byOrg(s.documentReads) },
      { name: 'inventory_entries', table: s.inventoryEntries, rows: await byOrg(s.inventoryEntries) },
      { name: 'inventory_approvals', table: s.inventoryApprovals, rows: await byOrg(s.inventoryApprovals) },
      { name: 'tasks', table: s.tasks, rows: await byOrg(s.tasks) },
      { name: 'approval_requests', table: s.approvalRequests, rows: await byOrg(s.approvalRequests) },
      { name: 'notifications', table: s.notifications, rows: await byOrg(s.notifications) },
      { name: 'contracts', table: s.contracts, rows: await byOrg(s.contracts) },
      { name: 'incidents', table: s.incidents, rows: await byOrg(s.incidents) },
      { name: 'destruction_officers', table: s.destructionOfficers, rows: await byOrg(s.destructionOfficers) },
      { name: 'destruction_plans', table: s.destructionPlans, rows: await byOrg(s.destructionPlans) },
      { name: 'destruction_items', table: s.destructionItems, rows: await byOrg(s.destructionItems) },
      { name: 'destruction_records', table: s.destructionRecords, rows: await byOrg(s.destructionRecords) },
      { name: 'data_subject_requests', table: s.dataSubjectRequests, rows: requests },
      { name: 'data_subject_request_files', table: s.dataSubjectRequestFiles, rows: requestFiles },
      { name: 'data_subject_request_events', table: s.dataSubjectRequestEvents, rows: requestEvents },
      { name: 'employees', table: s.employees, rows: await byOrg(s.employees) },
      { name: 'training_groups', table: s.trainingGroups, rows: groups },
      { name: 'training_participants', table: s.trainingParticipants, rows: participants },
      { name: 'training_exam_attempts', table: s.trainingExamAttempts, rows: attempts },
      { name: 'training_exam_answers', table: s.trainingExamAnswers, rows: answers },
      { name: 'support_tickets', table: s.supportTickets, rows: tickets },
      { name: 'support_messages', table: s.supportMessages, rows: messages },
      { name: 'support_attachments', table: s.supportAttachments, rows: attachments },
      { name: 'audit_logs', table: s.auditLogs, rows: await byOrg(s.auditLogs) },
    ];

    const files: ExportFile[] = [];
    const used = new Set<string>();
    for (const v of documentVersions) {
      // Dosya adı genelde kodu ve sürümü içerir (ör. "POL-010 ... - v2.docx"); aynısı varsa sürüm kimliği eklenir.
      let path = `dokumanlar/${safeName(v.fileName)}`;
      if (used.has(path)) path = `dokumanlar/${v.id}-${safeName(v.fileName)}`;
      used.add(path);
      files.push({ path, content: v.content });
    }
    for (const a of attachments) files.push({ path: `destek-ekleri/${a.id}-${safeName(a.fileName)}`, content: a.content });
    for (const f of requestFiles) files.push({ path: `basvuru-dosyalari/${f.id}-${safeName(f.fileName)}`, content: f.content });
    if (org.logo) files.push({ path: `logo.${org.logoMime === 'image/png' ? 'png' : 'jpg'}`, content: org.logo });

    const workbook = new ExcelJS.Workbook();
    let rowCount = 0;
    for (const sheet of sheets) {
      const columns = Object.entries(getTableColumns(sheet.table))
        .filter(([key, col]) => !HIDDEN.has(key) && col.getSQLType() !== 'bytea')
        .map(([key]) => key);
      const ws = workbook.addWorksheet(sheet.name.slice(0, 31));
      ws.columns = columns.map((key) => ({ header: key, key, width: 18 }));
      ws.getRow(1).font = { bold: true };
      for (const row of sheet.rows) ws.addRow(Object.fromEntries(columns.map((c) => [c, cell(row[c])])));
      rowCount += sheet.rows.length;
    }

    const zip = new PizZip();
    zip.file('BENIOKU.txt', README);
    zip.file('veriler.xlsx', Buffer.from(await workbook.xlsx.writeBuffer()));
    for (const f of files) zip.file(f.path, f.content);
    const content = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Buffer;
    const day = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
    return {
      fileName: `${safeName(org.name)} veri aktarimi ${day}.zip`,
      content,
      stats: { tables: sheets.length, rows: rowCount, files: files.length },
    };
  }
}

/** Excel hücresine yazılacak değer: nesneler JSON, formül gibi başlayan metinler düz metin olarak. */
function cell(v: unknown) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (Buffer.isBuffer(v)) return null;
  const text = typeof v === 'object' ? JSON.stringify(v) : v;
  if (typeof text !== 'string') return text as number | boolean;
  // Excel bir hücrede en fazla 32 767 karakter gösterir.
  const fitted = text.length > MAX_CELL ? `${text.slice(0, MAX_CELL)} …(kısaltıldı)` : text;
  return /^[=+\-@]/.test(fitted) ? `'${fitted}` : fitted;
}
