'use client';

import { PERMISSIONS, Permission } from '@kvkk/shared';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Loading } from './ui';

interface NavItem {
  href: string;
  label: string;
  permission?: Permission;
}

const NAV: NavItem[] = [
  { href: '/', label: 'Özet' },
  { href: '/kurulus', label: 'Kuruluş bilgileri', permission: PERMISSIONS.ORG_READ },
  { href: '/dokumanlar', label: 'Dokümanlar', permission: PERMISSIONS.DOCUMENTS_READ },
  { href: '/envanter', label: 'Veri envanteri', permission: PERMISSIONS.INVENTORY_READ },
  { href: '/gorevler', label: 'Görevler' },
  { href: '/bildirimler', label: 'Bildirimler' },
];

/** Kuruluş seçilmeden açılabilen sayfalar. */
const NO_ORG_PATHS = ['/kurulus-olustur'];

const isActive = (pathname: string, href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

export function AppShell({ children }: { children: ReactNode }) {
  const { me, loading, org, selectOrg, can, logout } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const needsOrg = !NO_ORG_PATHS.includes(pathname);

  useEffect(() => {
    if (loading) return;
    if (!me) router.replace(`/giris?sonra=${encodeURIComponent(pathname)}`);
    else if (!org && needsOrg) router.replace('/kurulus-olustur');
  }, [loading, me, org, needsOrg, pathname, router]);

  useEffect(() => setMenuOpen(false), [pathname]);

  // Okunmamış bildirim sayısı dakikada bir yenilenir.
  useEffect(() => {
    if (!org) return;
    let stopped = false;
    const load = () =>
      api<{ unreadCount: number }>('notifications', { query: { unread: true } })
        .then((r) => !stopped && setUnread(r.unreadCount))
        .catch(() => undefined);
    load();
    const timer = setInterval(load, 60_000);
    window.addEventListener('kvkk:notifications', load);
    return () => {
      stopped = true;
      clearInterval(timer);
      window.removeEventListener('kvkk:notifications', load);
    };
  }, [org]);

  if (loading || !me || (!org && needsOrg)) return <Loading />;

  const items = NAV.filter((n) => !n.permission || can(n.permission));

  return (
    <div className="shell">
      <header className="topbar">
        <button type="button" aria-label="Menü" onClick={() => setMenuOpen(true)}>
          ☰
        </button>
        <strong>KVK Yönetim Sistemi</strong>
      </header>
      {menuOpen && <div className="backdrop" onClick={() => setMenuOpen(false)} />}
      <nav className={`sidebar${menuOpen ? ' open' : ''}`} aria-label="Ana menü">
        <div className="brand">
          KVK Yönetim Sistemi
          <small>KVKK uyum yönetimi</small>
        </div>
        {me.organizations.length > 1 && org && (
          <select
            className="org-select"
            aria-label="Kuruluş"
            value={org.id}
            onChange={(e) => {
              selectOrg(e.target.value);
              router.push('/');
            }}
          >
            {me.organizations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        )}
        {org &&
          items.map((n) => (
            <Link key={n.href} href={n.href} className={`nav-link${isActive(pathname, n.href) ? ' active' : ''}`}>
              {n.label}
              {n.href === '/bildirimler' && unread > 0 && <span className="nav-badge">{unread}</span>}
            </Link>
          ))}
        <Link href="/kurulus-olustur" className={`nav-link${pathname === '/kurulus-olustur' ? ' active' : ''}`}>
          + Yeni kuruluş
        </Link>
        <div className="sidebar-footer">
          <div style={{ color: '#fff' }}>{me.fullName}</div>
          {org && <div>{org.role.name}</div>}
          <button type="button" onClick={logout} style={{ marginTop: 8 }}>
            Çıkış yap
          </button>
        </div>
      </nav>
      <main className="main">{children}</main>
    </div>
  );
}
