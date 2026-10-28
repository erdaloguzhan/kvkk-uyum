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
  INVENTORY_APPROVE: 'inventory.approve',
  TASKS_READ: 'tasks.read',
  TASKS_MANAGE: 'tasks.manage',
  INCIDENTS_READ: 'incidents.read',
  INCIDENTS_MANAGE: 'incidents.manage',
  INCIDENTS_APPROVE: 'incidents.approve',
  CONTRACTS_READ: 'contracts.read',
  CONTRACTS_MANAGE: 'contracts.manage',
  DESTRUCTION_READ: 'destruction.read',
  DESTRUCTION_MANAGE: 'destruction.manage',
  DESTRUCTION_APPROVE: 'destruction.approve',
  /** İlgili kişi başvuruları (FRM-010). */
  REQUESTS_READ: 'requests.read',
  REQUESTS_MANAGE: 'requests.manage',
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
 * Sorumlu tüm işi yapar; dokümanları, veri envanterindeki değişiklikleri ve imha planlarını Yöneticinin onayına gönderir.
 * Yönetici dokümanları, envanter değişikliklerini, veri ihlali bildirimlerini ve imha planlarını onaylar, görev atar; başka bir şeyi değiştiremez.
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
    permissions: ALL_PERMISSIONS.filter(
      (p) =>
        p !== PERMISSIONS.DOCUMENTS_APPROVE &&
        p !== PERMISSIONS.INVENTORY_APPROVE &&
        p !== PERMISSIONS.INCIDENTS_APPROVE &&
        p !== PERMISSIONS.DESTRUCTION_APPROVE,
    ),
  },
  {
    key: 'approver',
    name: 'Yönetici',
    permissions: [
      PERMISSIONS.DOCUMENTS_READ,
      PERMISSIONS.DOCUMENTS_APPROVE,
      PERMISSIONS.INVENTORY_READ,
      PERMISSIONS.INVENTORY_APPROVE,
      PERMISSIONS.DESTRUCTION_READ,
      PERMISSIONS.DESTRUCTION_APPROVE,
      // Görev atamak için: görevleri görür, açar/değiştirir ve atayacağı kişileri seçmek için üyeleri listeler.
      PERMISSIONS.TASKS_READ,
      PERMISSIONS.TASKS_MANAGE,
      PERMISSIONS.USERS_READ,
      // İlgili kişi başvurularını ve raporlarını görür; cevabı Sorumlu kaydeder.
      PERMISSIONS.REQUESTS_READ,
      // Veri ihlali kayıtlarını görür ve Kurula bildirim formunu onaylar (PRS-030: bildirim yöneticinin yükümlülüğü).
      PERMISSIONS.INCIDENTS_READ,
      PERMISSIONS.INCIDENTS_APPROVE,
    ],
  },
];

/** Admin panelinden açılan kuruluşa davet edilen ilk kişinin rolü. */
export const ORG_ADMIN_ROLE_KEY = 'officer_approver';
