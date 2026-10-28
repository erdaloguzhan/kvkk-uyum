'use client';

import { PERMISSIONS, Permission } from '@kvkk/shared';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { roleHome, selectableRoles, useSession } from '@/lib/session';
import { Empty, Loading } from './ui';
import { Logo } from './logo';

interface NavItem {
  href: string;
  label: string;
  /** Bu yetkilerden biri varsa menüde görünür. */
  permission?: Permission | Permission[];
}

const NAV: NavItem[] = [
  { href: '/', label: 'Özet' },
  { href: '/kurulus', label: 'Kuruluş bilgileri', permission: PERMISSIONS.ORG_READ },
  { href: '/dokumanlar', label: 'Dokümanlar', permission: PERMISSIONS.DOCUMENTS_READ },
  { href: '/envanter', label: 'Veri envanteri', permission: PERMISSIONS.INVENTORY_READ },
  { href: '/sozlesmeler', label: 'Sözleşmeler', permission: PERMISSIONS.CONTRACTS_READ },
  { href: '/basvurular', label: 'İlgili kişi başvuruları', permission: PERMISSIONS.REQUESTS_READ },
  { href: '/gorevler', label: 'Görevler', permission: PERMISSIONS.TASKS_READ },
  { href: '/bildirimler', label: 'Bildirimler' },
  { href: '/kayitlar', label: 'İşlem kayıtları', permission: PERMISSIONS.AUDIT_READ },
  { href: '/destek', label: 'Destek' },
];

const isActive = (pathname: string, href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

export function AppShell({ children }: { children: ReactNode }) {
  const { me, loading, org, role, can, logout } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  // Eğitmen veya platform yöneticisi rolündeki kişi yönetim paneline yönlendirilir (profil sayfası hariç).
  const toAdmin = !!me && !org && pathname !== '/profil' && (role?.kind === 'admin' || role?.kind === 'trainer');

  useEffect(() => {
    if (loading) return;
    if (!me) router.replace(`/giris?sonra=${encodeURIComponent(pathname)}`);
    else if (toAdmin && role) router.replace(roleHome(role));
  }, [loading, me, toAdmin, role, pathname, router]);

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

  if (loading || !me || toAdmin) return <Loading />;

  const allowed = (n: NavItem) => !n.permission || [n.permission].flat().some(can);
  const items = NAV.filter(allowed);
  // Menüde görünmeyen bir bölümün adresine doğrudan gidilirse sayfa yerine tek bir yetki mesajı gösterilir.
  const blocked = NAV.some((n) => n.href !== '/' && isActive(pathname, n.href) && !allowed(n));

  return (
    <div className="shell">
      <header className="topbar">
        <button type="button" aria-label="Menü" onClick={() => setMenuOpen(true)}>
          ☰
        </button>
        <Logo height={34} onDark />
        <strong>KVK Uyum Yönetim Sistemi</strong>
      </header>
      {menuOpen && <div className="backdrop" onClick={() => setMenuOpen(false)} />}
      <nav className={`sidebar${menuOpen ? ' open' : ''}`} aria-label="Ana menü">
        <div className="brand">
          <Logo onDark />
          KVK Uyum Yönetim Sistemi
          <small>KVKK uyum yönetimi</small>
        </div>
        {org &&
          items.map((n) => (
            <Link key={n.href} href={n.href} className={`nav-link${isActive(pathname, n.href) ? ' active' : ''}`}>
              {n.label}
              {n.href === '/bildirimler' && unread > 0 && <span className="nav-badge">{unread}</span>}
            </Link>
          ))}
        {selectableRoles(me).length > 1 && (
          <Link href="/rol-sec" className="nav-link">
            Rol değiştir
          </Link>
        )}
        <div className="sidebar-footer">
          <div style={{ color: '#fff' }}>{me.fullName}</div>
          {org && (
            <div>
              {org.role.name} · {org.name}
            </div>
          )}
          <div className="sidebar-actions">
            <Link href="/profil" className={pathname === '/profil' ? 'active' : undefined}>
              Profilim / şifre değiştir
            </Link>
            <button type="button" onClick={logout}>
              Çıkış yap
            </button>
          </div>
        </div>
      </nav>
      <main className="main">
        {org && blocked ? (
          <div className="card">
            <Empty title="Bu sayfayı görüntüleme yetkiniz yok">
              Rolünüz bu bölüme erişim içermiyor. <Link href="/">Özete dön</Link>
            </Empty>
          </div>
        ) : org || pathname === '/profil' ? (
          children
        ) : (
          <div className="card">
            <Empty title="Hesabınız henüz bir kuruluşa bağlı değil">
              Kuruluşunuz sisteme eklendiğinde veya bir kuruluş sizi davet ettiğinde burada görünecek. Yardım için sistem
              yöneticinizle iletişime geçin.
            </Empty>
          </div>
        )}
      </main>
    </div>
  );
}
