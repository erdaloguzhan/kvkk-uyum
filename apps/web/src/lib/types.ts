import type {
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
  publishedVersionId: string | null;
  updatedAt: string;
  publishedVersion: DocumentVersion | null;
  latestVersion?: DocumentVersion | null;
}

export interface DocumentDetail extends Omit<DocumentItem, 'publishedVersion' | 'latestVersion'> {
  versions: DocumentVersion[];
}

export interface TemplateItem {
  code: string;
  title: string;
  category: DocumentCategory;
  optional: boolean;
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
  user: { id: string; email: string; fullName: string };
  role: { id: string; key: string; name: string };
}

export interface Notification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  taskId: string | null;
  approvalRequestId: string | null;
  readAt: string | null;
  createdAt: string;
}
