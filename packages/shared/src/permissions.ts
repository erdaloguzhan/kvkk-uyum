/**
 * Yetki anahtarları `modül.eylem` biçimindedir. Web, mobil ve API aynı listeyi kullanır;
 * menü ve fonksiyon bazlı yetkilendirme bu anahtarlarla yapılır.
 */
export const PERMISSIONS = {
  ORG_READ: 'org.read',
  ORG_MANAGE: 'org.manage',
  USERS_READ: 'users.read',
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

/**
 * Müşteri kuruluşlarında yalnızca bu sabit roller vardır; özel rol tanımlanamaz.
 * Sorumlu tüm işi yapar ve dokümanları Yöneticinin onayına gönderir. Yönetici yalnızca onay verir.
 * Aynı kişi (aynı e-posta) her ikisi olacaksa "Sorumlu + Yönetici" rolü atanır.
 * Çalışanlar yayınlanmış dokümanları ayrı bir rol yerine eğitim portalı hesaplarıyla görür.
 */
export const SYSTEM_ROLES: SystemRoleDefinition[] = [
  {
    key: 'officer_approver',
    name: 'KVKK Sorumlusu + Yönetici',
    permissions: ALL_PERMISSIONS,
  },
  {
    key: 'kvkk_officer',
    name: 'KVKK Sorumlusu',
    permissions: ALL_PERMISSIONS.filter((p) => p !== PERMISSIONS.DOCUMENTS_APPROVE),
  },
  {
    key: 'approver',
    name: 'Yönetici',
    permissions: [PERMISSIONS.DOCUMENTS_READ, PERMISSIONS.DOCUMENTS_APPROVE],
  },
];

/** Admin panelinden açılan kuruluşa davet edilen ilk kişinin rolü. */
export const ORG_ADMIN_ROLE_KEY = 'officer_approver';
