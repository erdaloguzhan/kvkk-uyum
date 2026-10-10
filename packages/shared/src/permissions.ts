/**
 * Yetki anahtarları `modül.eylem` biçimindedir. Web, mobil ve API aynı listeyi kullanır;
 * menü ve fonksiyon bazlı yetkilendirme bu anahtarlarla yapılır.
 */
export const PERMISSIONS = {
  ORG_READ: 'org.read',
  ORG_MANAGE: 'org.manage',
  USERS_READ: 'users.read',
  USERS_MANAGE: 'users.manage',
  ROLES_MANAGE: 'roles.manage',
  AUDIT_READ: 'audit.read',
  DOCUMENTS_READ: 'documents.read',
  DOCUMENTS_WRITE: 'documents.write',
  DOCUMENTS_APPROVE: 'documents.approve',
  INVENTORY_READ: 'inventory.read',
  INVENTORY_WRITE: 'inventory.write',
  TASKS_READ: 'tasks.read',
  TASKS_MANAGE: 'tasks.manage',
  INCIDENTS_MANAGE: 'incidents.manage',
  CONTRACTS_READ: 'contracts.read',
  CONTRACTS_MANAGE: 'contracts.manage',
  DESTRUCTION_MANAGE: 'destruction.manage',
  REPORTS_READ: 'reports.read',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: Permission[] = Object.values(PERMISSIONS);

export interface SystemRoleDefinition {
  key: string;
  name: string;
  permissions: Permission[];
}

/** Her yeni kuruluşa otomatik oluşturulan varsayılan roller. */
export const SYSTEM_ROLES: SystemRoleDefinition[] = [
  {
    key: 'org_admin',
    name: 'Kuruluş Yöneticisi',
    permissions: ALL_PERMISSIONS,
  },
  {
    key: 'kvkk_officer',
    name: 'KVKK Sorumlusu',
    permissions: ALL_PERMISSIONS.filter(
      (p) => p !== PERMISSIONS.ORG_MANAGE && p !== PERMISSIONS.ROLES_MANAGE && p !== PERMISSIONS.USERS_MANAGE,
    ),
  },
  {
    key: 'viewer',
    name: 'Görüntüleyici',
    permissions: ALL_PERMISSIONS.filter((p) => p.endsWith('.read')),
  },
];

export const ORG_ADMIN_ROLE_KEY = 'org_admin';
