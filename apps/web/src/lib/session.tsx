'use client';

import type { Permission } from '@kvkk/shared';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, setCurrentOrgId } from './api';
import type { Me, OrgMembership } from './types';

const ORG_STORAGE_KEY = 'kvkk_kurulus';

interface SessionValue {
  me: Me | null;
  loading: boolean;
  org: OrgMembership | null;
  selectOrg: (id: string) => void;
  can: (p: Permission) => boolean;
  reload: () => Promise<Me | null>;
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

function readStoredOrg(): string | null {
  try {
    return localStorage.getItem(ORG_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const data = await api<Me>('auth/me', { redirect: false });
      setMe(data);
      return data;
    } catch {
      setMe(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const org = useMemo(() => {
    if (!me || me.organizations.length === 0) return null;
    const wanted = orgId ?? readStoredOrg();
    return me.organizations.find((o) => o.id === wanted) ?? me.organizations[0];
  }, [me, orgId]);

  // İstekler seçili kuruluş adına yapılır; render sırasında ayarlanır ki alt bileşenlerin ilk isteği doğru gitsin.
  setCurrentOrgId(org?.id ?? null);

  const selectOrg = useCallback((id: string) => {
    try {
      localStorage.setItem(ORG_STORAGE_KEY, id);
    } catch {
      // Tarayıcı depolaması kapalıysa seçim yalnızca bu sekmede geçerli olur.
    }
    setOrgId(id);
  }, []);

  const can = useCallback((p: Permission) => !!org?.role.permissions.includes(p), [org]);

  const logout = useCallback(async () => {
    await fetch('/api/session/logout', { method: 'POST' }).catch(() => undefined);
    setMe(null);
    window.location.href = '/giris';
  }, []);

  const value = useMemo(
    () => ({ me, loading, org, selectOrg, can, reload, logout }),
    [me, loading, org, selectOrg, can, reload, logout],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('SessionProvider eksik');
  return value;
}
