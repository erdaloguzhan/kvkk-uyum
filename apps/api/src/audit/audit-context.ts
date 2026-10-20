import { AsyncLocalStorage } from 'node:async_hooks';

/** İstek boyunca log kayıtlarına eklenecek bilgiler ve bu istekte log yazılıp yazılmadığı. */
export interface AuditRequestContext {
  ip: string | null;
  userAgent: string | null;
  recorded: boolean;
}

export const auditContext = new AsyncLocalStorage<AuditRequestContext>();
