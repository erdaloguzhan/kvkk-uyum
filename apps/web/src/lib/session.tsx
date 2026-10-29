'use client';

import type { Permission } from '@kvkk/shared';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError, SESSION_CHECK_EVENT, setCurrentOrgId } from './api';
import type { Me, OrgMembership } from './types';

const ORG_STORAGE_KEY = 'kvkk_kurulus';
const ROLE_STORAGE_KEY = 'kvkk_rol';
/** Kullanıcı bilgisi en fazla bu sıklıkta yeniden okunur. */
const RECHECK_MIN_MS = 15_000;
/** Sekme bu süreden uzun arka planda kaldıysa geri dönünce kullanıcı bilgisi yeniden okunur. */
const RECHECK_AFTER_HIDDEN_MS = 60_000;

/**
 * Oturumdaki rol. Bir kişi birden çok role sahip olabilir (eğitimci, kuruluşlarda Sorumlu/Yönetici, platform
 * yöneticisi); girişte biri seçilir. Platform yöneticisi rolü seçim ekranında yer almaz, /admin adresinden girilir.
 */
export type ActiveRole = { kind: 'admin' } | { kind: 'trainer' } | { kind: 'org'; orgId: string };

export interface SelectableRole {
  role: ActiveRole;
  title: string;
  detail: string;
}

/** Girişte seçilebilen roller (platform yöneticisi hariç). */
export function selectableRoles(me: Me): SelectableRole[] {
  const roles: SelectableRole[] = me.organizations.map((o) => ({
    role: { kind: 'org', orgId: o.id },
    title: o.role.name,
    detail: o.name,
  }));
  if (me.isTrainer) roles.push({ role: { kind: 'trainer' }, title: 'Eğitmen', detail: 'Uzaktan eğitim yönetimi' });
  return roles;
}

/** Rolün açılış sayfası. */
export function roleHome(role: ActiveRole): string {
  return role.kind === 'admin' ? '/admin' : role.kind === 'trainer' ? '/admin/egitim' : '/';
}

/** Girişten sonra gidilecek adres: istenen adres rolün bölümündeyse oraya, değilse rolün açılış sayfasına. */
export function roleTarget(role: ActiveRole, next: string): string {
  const inAdmin = next.startsWith('/admin');
  if (role.kind === 'org') return inAdmin ? '/' : next;
  if (role.kind === 'trainer') return next.startsWith('/admin/egitim') ? next : roleHome(role);
  return inAdmin ? next : roleHome(role);
}

const sameRole = (a: ActiveRole | null, b: ActiveRole | null) =>
  !!a && !!b && a.kind === b.kind && (a.kind !== 'org' || (b.kind === 'org' && a.orgId === b.orgId));

/** Kişinin hâlâ sahip olduğu rol mü. */
function holds(me: Me, role: ActiveRole): boolean {
  if (role.kind === 'admin') return me.isPlatformAdmin;
  if (role.kind === 'trainer') return me.isTrainer;
  return me.organizations.some((o) => o.id === role.orgId);
}

/** Seçim yoksa: önce kuruluş rolü, sonra eğitmen, sonra platform yöneticisi. */
function defaultRole(me: Me): ActiveRole | null {
  const storedOrg = readStorage(ORG_STORAGE_KEY);
  const org = me.organizations.find((o) => o.id === storedOrg) ?? me.organizations[0];
  if (org) return { kind: 'org', orgId: org.id };
  if (me.isTrainer) return { kind: 'trainer' };
  if (me.isPlatformAdmin) return { kind: 'admin' };
  return null;
}

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function readStoredRole(): ActiveRole | null {
  try {
    const value = JSON.parse(readStorage(ROLE_STORAGE_KEY) ?? 'null');
    return value && typeof value.kind === 'string' ? (value as ActiveRole) : null;
  } catch {
    return null;
  }
}

interface SessionValue {
  me: Me | null;
  loading: boolean;
  org: OrgMembership | null;
  /** Oturumdaki rol; kuruluş rolünde `org` o kuruluştur, diğer rollerde `org` boştur. */
  role: ActiveRole | null;
  chooseRole: (role: ActiveRole) => void;
  selectOrg: (id: string) => void;
  can: (p: Permission) => boolean;
  reload: () => Promise<Me | null>;
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [chosen, setChosen] = useState<ActiveRole | null>(null);

  const meRef = useRef<Me | null>(null);
  const lastCheck = useRef(0);

  const reload = useCallback(async () => {
    lastCheck.current = Date.now();
    try {
      const data = await api<Me>('auth/me', { redirect: false });
      // Bilgi değişmediyse aynı nesne kalır; menüler ve sayfalar boşuna yeniden yüklenmez.
      const next = meRef.current && JSON.stringify(meRef.current) === JSON.stringify(data) ? meRef.current : data;
      meRef.current = next;
      setMe(next);
      return next;
    } catch (err) {
      // Sunucuya geçici olarak ulaşılamıyorsa (ör. güncelleme sırasında) açık oturum korunur.
      const unreachable = err instanceof ApiError && (err.status === 0 || err.status >= 500);
      if (unreachable && meRef.current) return meRef.current;
      meRef.current = null;
      setMe(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // Ekrandaki oturum bilgisi sunucuyla eşitlenir: bir istek yetki hatası aldığında ve uzun süre arka planda
  // kalan sekmeye dönüldüğünde. Böylece süresi dolan oturum giriş sayfasına yönlenir, admin panelinden
  // değişen rol ve yetkiler menüye yansır.
  useEffect(() => {
    let hiddenAt = 0;
    const recheck = () => {
      if (meRef.current && Date.now() - lastCheck.current >= RECHECK_MIN_MS) reload();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt >= RECHECK_AFTER_HIDDEN_MS) recheck();
    };
    window.addEventListener(SESSION_CHECK_EVENT, recheck);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener(SESSION_CHECK_EVENT, recheck);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [reload]);

  const role = useMemo(() => {
    if (!me) return null;
    const wanted = chosen ?? readStoredRole();
    return wanted && holds(me, wanted) ? wanted : defaultRole(me);
  }, [me, chosen]);

  const org = useMemo(
    () => (me && role?.kind === 'org' ? (me.organizations.find((o) => o.id === role.orgId) ?? null) : null),
    [me, role],
  );

  // İstekler seçili kuruluş adına yapılır; render sırasında ayarlanır ki alt bileşenlerin ilk isteği doğru gitsin.
  setCurrentOrgId(org?.id ?? null);

  const chooseRole = useCallback((next: ActiveRole) => {
    try {
      localStorage.setItem(ROLE_STORAGE_KEY, JSON.stringify(next));
      if (next.kind === 'org') localStorage.setItem(ORG_STORAGE_KEY, next.orgId);
    } catch {
      // Tarayıcı depolaması kapalıysa seçim yalnızca bu sekmede geçerli olur.
    }
    setChosen((current) => (sameRole(current, next) ? current : next));
  }, []);

  const selectOrg = useCallback((id: string) => chooseRole({ kind: 'org', orgId: id }), [chooseRole]);

  const can = useCallback((p: Permission) => !!org?.role.permissions.includes(p), [org]);

  const logout = useCallback(async () => {
    await fetch('/api/session/logout', { method: 'POST' }).catch(() => undefined);
    try {
      localStorage.removeItem(ROLE_STORAGE_KEY);
    } catch {
      // Depolama kapalı.
    }
    meRef.current = null;
    setMe(null);
    window.location.href = '/giris';
  }, []);

  const value = useMemo(
    () => ({ me, loading, org, role, chooseRole, selectOrg, can, reload, logout }),
    [me, loading, org, role, chooseRole, selectOrg, can, reload, logout],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('SessionProvider eksik');
  return value;
}
