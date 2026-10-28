import type {
  ContractStatus,
  ContractType,
  DocumentCategory,
  InventoryColumnDefinition,
  InventoryField,
  DataCategoryDefinition,
  Permission,
  StorageMedium,
  TaskStatus,
  TaskType,
  TaskEntityType,
  ApprovalStatus,
  NotificationKind,
  SupportCategory,
  SupportStatus,
  DsrAnswerMethod,
  DsrChannel,
  DsrEventKind,
  DsrOutcome,
  DsrRelationship,
  DsrRequestItem,
  DsrResponseMethod,
  DsrStatus,
  IncidentForm,
  IncidentNotificationType,
  IncidentStatus,
  DestructionItemStatus,
  DestructionOperation,
  DestructionPlanStatus,
} from '@kvkk/shared';

export interface OrgMembership {
  id: string;
  name: string;
  licenseStatus: 'trial' | 'active' | 'expired';
  licenseExpiresAt: string | null;
  setupCompletedAt: string | null;
  role: { key: string; name: string; permissions: Permission[] };
}

export interface Me {
  id: string;
  email: string;
  fullName: string;
  /** Giriş doğrulama kodunun SMS ile gittiği cep telefonu; yoksa kod e-postaya gider. */
  phone: string | null;
  /** Yönetim paneline (/admin) erişebilir. */
  isPlatformAdmin: boolean;
  /** Aktif eğitimci: yönetim panelinde yalnızca eğitim bölümünü görür. */
  isTrainer: boolean;
  organizations: OrgMembership[];
}

export interface Organization {
  id: string;
  name: string;
  address: string | null;
  email: string | null;
  phone: string | null;
  kepAddress: string | null;
  authorizedPerson: string | null;
  taxNumber: string | null;
  website: string | null;
  licenseStatus: string;
  licenseExpiresAt: string | null;
  setupCompletedAt: string | null;
}

export interface DocumentVersion {
  id: string;
  documentId: string;
  versionNo: number;
  status: 'draft' | 'published' | 'superseded';
  source: 'template' | 'upload';
  fileName: string;
  sizeBytes: number;
  unfilledPlaceholders: string[];
  note: string | null;
  createdAt: string;
  publishedAt: string | null;
}

export interface DocumentItem {
  id: string;
  templateCode: string | null;
  code: string;
  title: string;
  category: DocumentCategory;
  /** Yayınlanmış sürüm çalışanlara eğitim portalında gösterilir. */
  employeeVisible: boolean;
  publishedVersionId: string | null;
  updatedAt: string;
  publishedVersion: DocumentVersion | null;
  latestVersion?: DocumentVersion | null;
  /** Ana şablonun dokümanın dayandığından daha yeni bir sürümü yayında. */
  templateUpdate?: TemplateUpdate | null;
}

export interface TemplateUpdate {
  versionNo: number;
  effectiveFrom: string | null;
}

export interface DocumentDetail extends Omit<DocumentItem, 'publishedVersion' | 'latestVersion'> {
  versions: DocumentVersion[];
}

export interface TemplateItem {
  code: string;
  title: string;
  category: DocumentCategory;
  optional: boolean;
  versionNo: number;
  effectiveFrom: string | null;
  documentId: string | null;
}

export type InventoryEntry = {
  id: string;
  department: string;
  activity: string;
  dataCategory: string;
  personalData: string | null;
  specialCategoryData: string | null;
  purposes: string[];
  storageMedium: StorageMedium | null;
  storageLocation: string | null;
  dataSubjectGroups: string[];
  legalBases: string[];
  relatedLegislation: string | null;
  retentionPeriod: string | null;
  recipients: string[];
  foreignTransfers: string | null;
  administrativeMeasures: string[];
  technicalMeasures: string[];
  complete: boolean;
  missingFields: string[];
  updatedAt: string;
};

export interface InventoryOptions {
  columns: InventoryColumnDefinition[];
  requiredFields: InventoryField[];
  storageMedia: Record<StorageMedium, string>;
  dataCategories: DataCategoryDefinition[];
  suggestions: Record<string, string[]>;
}

export interface InventorySummary {
  entries: number;
  incomplete: number;
  specialCategory: number;
  foreignTransfer: number;
  departments: { department: string; entries: number; incomplete: number }[];
}

export interface Task {
  id: string;
  type: TaskType;
  title: string;
  description: string | null;
  dueDate: string;
  reminderDays: number[];
  recurrenceMonths: number | null;
  status: TaskStatus;
  entityType: TaskEntityType | null;
  entityId: string | null;
  completedAt: string | null;
  completionNote: string | null;
  createdBy: string | null;
  createdAt: string;
  assignee: { id: string; fullName: string; email: string };
  daysLeft: number | null;
  overdue: boolean;
}

export interface TaskSummary {
  open: number;
  overdue: number;
  dueToday: number;
  dueWithin7Days: number;
  byType: { type: TaskType; open: number }[];
}

export interface ApprovalRequest {
  id: string;
  status: ApprovalStatus;
  note: string | null;
  decisionNote: string | null;
  decidedAt: string | null;
  createdAt: string;
  taskId: string | null;
  dueDate: string | null;
  document: { id: string; code: string; title: string };
  version: { id: string; versionNo: number; status: string };
  approver: { id: string; fullName: string };
  requestedBy: { id: string; fullName: string } | null;
}

export interface Member {
  id: string;
  status: 'active' | 'disabled';
  user: { id: string; email: string; fullName: string; phone: string | null };
  role: { id: string; key: string; name: string };
}

export interface Notification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  taskId: string | null;
  approvalRequestId: string | null;
  incidentId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface Contract {
  id: string;
  partyName: string;
  /** Eski türlerden aktarılan kayıtlarda boş olabilir. */
  type: ContractType | null;
  startDate: string | null;
  endDate: string | null;
  status: ContractStatus;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  description: string | null;
  signedCopyUrl: string | null;
  /** Bitiş tarihine kalan gün (bitiş tarihi yoksa null; geçtiyse eksi). */
  daysToEnd: number | null;
  createdAt: string;
  updatedAt: string;
}

// ---- Yönetim paneli ----

export interface AdminOrganization {
  id: string;
  name: string;
  email: string | null;
  authorizedPerson: string | null;
  licenseStatus: 'trial' | 'active' | 'expired';
  licenseExpiresAt: string | null;
  setupCompletedAt: string | null;
  createdAt: string;
  memberCount: number;
}

export type TemplateVersionState = 'draft' | 'current' | 'scheduled' | 'past';

export interface TemplateVersion {
  id: string;
  templateCode: string;
  versionNo: number;
  status: 'draft' | 'published';
  state: TemplateVersionState;
  fileName: string;
  sizeBytes: number;
  note: string | null;
  effectiveFrom: string | null;
  createdAt: string;
  publishedAt: string | null;
}

export interface AdminTemplate {
  code: string;
  title: string;
  category: DocumentCategory;
  optional: boolean;
  updatedAt: string;
  currentVersion: TemplateVersion | null;
  scheduledVersions: TemplateVersion[];
  draftCount: number;
  latestVersionNo: number;
}

export interface AdminTemplateDetail {
  code: string;
  title: string;
  category: DocumentCategory;
  optional: boolean;
  versions: TemplateVersion[];
}

// ---- Uzaktan eğitim ----

export interface Employee {
  id: string;
  organizationId: string;
  nationalId: string;
  firstName: string;
  lastName: string;
  hireDate: string | null;
  terminationDate: string | null;
  phone: string | null;
  email: string | null;
  trainingCount: number;
}

export interface Trainer {
  id: string;
  nationalId: string;
  firstName: string;
  lastName: string;
  hireDate: string | null;
  terminationDate: string | null;
  phone: string | null;
  email: string;
  /** Sertifikada adın altında yazar. */
  title: string | null;
  hasSignature: boolean;
  isActive: boolean;
}

export type TestType = 'pre' | 'post';
export type OptionKey = 'A' | 'B' | 'C' | 'D';

export interface TrainingSummary {
  id: string;
  name: string;
  description: string | null;
  passScore: number;
  status: 'draft' | 'active';
  topicCount: number;
  groupCount: number;
  updatedAt: string;
}

export interface TrainingTopic {
  id: string;
  sortOrder: number;
  title: string;
  content: string;
  minReadSeconds: number;
}

export interface TrainingQuestion {
  id: string;
  testType: TestType;
  sortOrder: number;
  text: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctOption: OptionKey;
  points: number;
}

export interface TrainingDetail extends TrainingSummary {
  topics: TrainingTopic[];
  questions: TrainingQuestion[];
  totals: Record<TestType, number>;
  questionsLocked: boolean;
  problems: string[];
}

export interface TrainingGroup {
  id: string;
  name: string;
  assignedAt: string | null;
  createdAt: string;
  organizationId: string;
  organizationName: string;
  trainingId: string;
  trainingName: string;
  /** Grubun eğitimcisi; sertifikada yazar. */
  trainerId: string | null;
  trainerName: string | null;
  participantCount: number;
  sentCount: number;
  completedCount: number;
}

export interface TrainingResult {
  id: string;
  groupId: string;
  groupName: string;
  organizationName: string;
  trainingName: string;
  passScore: number;
  employeeId: string;
  nationalId: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  sentAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  preTestScore: number | null;
  postTestScore: number | null;
  postTestAttempts: number;
  passed: boolean | null;
}

export interface TrainingGroupDetail extends TrainingGroup {
  participants: TrainingResult[];
}

export interface PickableEmployee {
  id: string;
  nationalId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  terminationDate: string | null;
}

export interface PortalAssignment {
  id: string;
  trainingName: string;
  groupName: string;
  organizationName: string;
  sentAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface PortalDocument {
  id: string;
  organizationId: string;
  organizationName: string;
  code: string;
  title: string;
  category: DocumentCategory;
  versionId: string;
  versionNo: number;
  publishedAt: string | null;
  /** Yayındaki sürüm için verilen "Okudum, anladım." onayının zamanı. */
  confirmedAt: string | null;
}

export interface PortalDocumentView extends PortalDocument {
  html: string;
}

export interface PortalQuestion {
  id: string;
  text: string;
  options: Record<OptionKey, string>;
}

export interface PortalView {
  participantId: string;
  trainingName: string;
  organizationName: string;
  passScore: number;
  step: 'pretest' | 'topic' | 'posttest' | 'completed';
  topicCount: number;
  topic?: { index: number; title: string; content: string; minReadSeconds: number; remainingSeconds: number };
  questions?: PortalQuestion[];
  lastPostTest: { score: number; passed: boolean } | null;
  completedAt: string | null;
  /** Sınav teslim edilince dönen sonuç. */
  score?: number;
  passed?: boolean | null;
}

export interface SupportTicket {
  id: string;
  number: number;
  organizationId: string;
  organizationName: string;
  subject: string;
  category: SupportCategory;
  status: SupportStatus;
  createdBy: string | null;
  createdByName: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  firstResponseAt: string | null;
  lastMessageAt: string;
  closedAt: string | null;
  createdAt: string;
  messageCount: number;
}

export interface SupportAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
}

export interface SupportMessage {
  id: string;
  authorId: string | null;
  authorName: string | null;
  isStaff: boolean;
  body: string;
  createdAt: string;
  attachments: SupportAttachment[];
}

export interface SupportTicketDetail extends SupportTicket {
  createdByEmail: string | null;
  messages: SupportMessage[];
}

/** Son onaylanan envantere göre bir satırdaki değişiklik. */
export interface InventoryChange {
  entryId: string;
  kind: 'added' | 'updated' | 'deleted';
  department: string;
  activity: string;
  dataCategory: string;
  fields?: { field: InventoryField; before: unknown; after: unknown }[];
}

export interface InventoryApproval {
  id: string;
  status: ApprovalStatus;
  note: string | null;
  decisionNote: string | null;
  decidedAt: string | null;
  createdAt: string;
  taskId: string | null;
  dueDate: string | null;
  approver: { id: string; fullName: string };
  requestedBy: { id: string; fullName: string } | null;
  decidedBy: { id: string; fullName: string } | null;
  changes: InventoryChange[];
}

export type InventoryApprovalListItem = Omit<InventoryApproval, 'changes'> & { changeCount: number };

export interface InventoryApprovalStatus {
  lastApproved: InventoryApproval | null;
  pending: InventoryApproval | null;
  changes: InventoryChange[];
}

export interface ReadEmployee {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
}

export interface DocumentReadReport {
  publishedVersion: { id: string; versionNo: number } | null;
  employeeVisible: boolean;
  reads: { id: string; confirmedAt: string; versionId: string; versionNo: number; employee: ReadEmployee }[];
  notConfirmed: ReadEmployee[];
}

export interface AuditLogEntry {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  ip: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  user: { id: string; email: string; fullName: string } | null;
}

export interface DataSubjectRequestSummary {
  id: string;
  number: number;
  code: string;
  channel: DsrChannel;
  fullName: string;
  nationalIdMasked: string | null;
  birthDate: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  relationship: DsrRelationship | null;
  relationshipDetail: string | null;
  responseMethod: DsrResponseMethod | null;
  items: DsrRequestItem[];
  description: string | null;
  status: DsrStatus;
  receivedAt: string;
  targetDate: string;
  legalDueDate: string;
  pausedOn: string | null;
  pausedDays: number;
  daysToTarget: number | null;
  daysToLegal: number | null;
  overdue: boolean;
  legalOverdue: boolean;
  answeredOn: string | null;
  answerOutcome: DsrOutcome | null;
  answerMethod: DsrAnswerMethod | null;
  answerSummary: string | null;
  answerRecordedAt: string | null;
  responseDays: number | null;
  createdAt: string;
  assignee?: { id: string; fullName: string } | null;
}

export interface DataSubjectRequestDetail extends DataSubjectRequestSummary {
  nationalId: string | null;
  ip: string | null;
  userAgent: string | null;
  createdBy: { id: string; fullName: string } | null;
  answerRecordedBy: { id: string; fullName: string } | null;
  task: { id: string; status: TaskStatus; dueDate: string; assignee: { id: string; fullName: string } } | null;
  files: { id: string; kind: 'applicant' | 'response' | 'other'; fileName: string; mimeType: string; size: number; createdAt: string }[];
  events: { id: string; kind: DsrEventKind; note: string | null; createdAt: string; user: { id: string; fullName: string } | null }[];
}

export interface RequestFormSettings {
  enabled: boolean;
  key: string;
  url: string;
  embedCode: string;
  /** Form ayarlarında seçilen kişi; null ise KVKK Sorumlusu kuralı uygulanır. */
  assignee: RequestAssigneeOption | null;
  /** Yeni başvurunun şu an düşeceği kişi. */
  effectiveAssignee: RequestAssigneeOption | null;
  candidates: RequestAssigneeOption[];
}

export interface RequestAssigneeOption {
  id: string;
  fullName: string;
  roleName: string;
}

export interface DataSubjectRequestReport {
  from: string | null;
  to: string | null;
  targetDays: number;
  legalDays: number;
  total: number;
  open: number;
  answered: number;
  averageResponseDays: number | null;
  answeredWithinTarget: number;
  answeredWithinLegal: number;
  answeredLate: number;
  openPastTarget: number;
  openPastLegal: number;
  openDueSoon: number;
  byStatus: { key: DsrStatus; count: number }[];
  byOutcome: { key: DsrOutcome; count: number }[];
  byChannel: { key: DsrChannel; count: number }[];
  byRelationship: { key: DsrRelationship; count: number }[];
  byItem: { no: number; count: number }[];
  byMonth: { month: string; received: number; answered: number }[];
}

export interface Incident {
  id: string;
  number: number;
  title: string;
  notificationType: IncidentNotificationType;
  parentId: string | null;
  followUpRef: string | null;
  occurredAt: string | null;
  detectedAt: string;
  form: IncidentForm;
  status: IncidentStatus;
  approverId: string | null;
  taskId: string | null;
  submittedAt: string | null;
  decision: 'approved' | 'rejected' | null;
  decisionNote: string | null;
  decidedAt: string | null;
  notifiedAt: string | null;
  closingNote: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** İlk bildirimde Kurula bildirim için son an (tespit + 72 saat). */
  deadlineAt: string | null;
  hoursLeft: number | null;
  overdue: boolean;
  notifiedOnTime: boolean | null;
  approver: { id: string; fullName: string } | null;
  createdByUser: { id: string; fullName: string } | null;
  decidedByUser: { id: string; fullName: string } | null;
}

export interface IncidentDetail extends Incident {
  parent: { id: string; number: number; title: string } | null;
  followUps: { id: string; number: number; title: string; notificationType: IncidentNotificationType; status: IncidentStatus }[];
}

export interface IncidentReport {
  from: string | null;
  to: string | null;
  total: number;
  followUps: number;
  byStatus: Record<IncidentStatus, number>;
  open: number;
  openOverdue: number;
  notified: number;
  notifiedOnTime: number;
  notifiedLate: number;
  closedWithoutNotice: number;
  averageHoursToNotify: number | null;
  estimatedPeople: number;
  estimatedRecords: number;
  specialCategoryIncidents: number;
  cyberAttacks: number;
  bySource: { label: string; count: number }[];
  byCategory: { label: string; count: number }[];
  byLikelihood: { label: string; count: number }[];
  items: Incident[];
}

// ---- Kişisel veri imha yönetimi ----

export interface DestructionSettings {
  periodMonths: number;
  lastPlanEnd: string | null;
  nextPeriodStart: string;
  uncovered: boolean;
}

export interface DestructionOfficer {
  id: string;
  employeeId: string | null;
  fullName: string;
  title: string | null;
  startDate: string;
  endDate: string | null;
  note: string | null;
  current: boolean;
  createdAt: string;
}

export interface DestructionPlanSummary {
  id: string;
  title: string;
  periodStart: string;
  periodEnd: string;
  description: string | null;
  status: DestructionPlanStatus;
  itemCount: number;
  doneCount: number;
  cancelledCount: number;
  createdAt: string;
}

export interface DestructionItem {
  id: string;
  planId: string;
  inventoryEntryId: string | null;
  dataDescription: string;
  storageMedium: StorageMedium | null;
  retentionPeriod: string | null;
  plannedDate: string;
  operationType: DestructionOperation;
  method: string | null;
  officerId: string | null;
  officerName: string | null;
  status: DestructionItemStatus;
  cancelReason: string | null;
  taskId: string | null;
  overdue: boolean;
  record: {
    id: string;
    performedDate: string;
    operationType: DestructionOperation;
    performedNote: string;
    officerName: string | null;
  } | null;
}

export interface DestructionPlan extends Omit<DestructionPlanSummary, 'itemCount' | 'doneCount' | 'cancelledCount'> {
  approver: { id: string; fullName: string } | null;
  requestedBy: { id: string; fullName: string } | null;
  decidedBy: { id: string; fullName: string } | null;
  requestedAt: string | null;
  requestNote: string | null;
  decisionNote: string | null;
  decidedAt: string | null;
  approvalDueDate: string | null;
  items: DestructionItem[];
}

export interface DestructionRecord {
  id: string;
  itemId: string | null;
  planId: string | null;
  planTitle: string | null;
  inventoryEntryId: string | null;
  dataDescription: string;
  storageMedium: StorageMedium | null;
  plannedDate: string | null;
  performedDate: string;
  operationType: DestructionOperation;
  performedNote: string;
  officerId: string | null;
  officerName: string | null;
  createdAt: string;
}
