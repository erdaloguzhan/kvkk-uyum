'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';
import { useSession } from '@/lib/session';
import { Empty, Loading } from './ui';

const NAV = [
  { href: '/admin', label: 'Kuruluşlar' },
  { href: '/admin/sablonlar', label: 'Doküman şablonları' },
];

const isActive = (pathname: string, href: string) =>
  href === '/admin' ? pathname === '/admin' || pathname.startsWith('/admin/kuruluslar') : pathname.startsWith(href);

/** Yönetim paneli (platform yöneticileri): kuruluşlar ve ana doküman şablonları. */
export function AdminShell({ children }: { children: ReactNode }) {
  const { me, loading, logout } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!loading && !me) router.replace(`/giris?sonra=${encodeURIComponent(pathname)}`);
  }, [loading, me, pathname, router]);

  useEffect(() => setMenuOpen(false), [pathname]);

  if (loading || !me) return <Loading />;

  return (
    <div className="shell">
      <header className="topbar">
        <button type="button" aria-label="Menü" onClick={() => setMenuOpen(true)}>
          ☰
        </button>
        <strong>Yönetim Paneli</strong>
      </header>
      {menuOpen && <div className="backdrop" onClick={() => setMenuOpen(false)} />}
      <nav className={`sidebar${menuOpen ? ' open' : ''}`} aria-label="Yönetim menüsü">
        <div className="brand">
          KVK Yönetim Sistemi
          <small>Yönetim paneli</small>
        </div>
        {me.isPlatformAdmin &&
          NAV.map((n) => (
            <Link key={n.href} href={n.href} className={`nav-link${isActive(pathname, n.href) ? ' active' : ''}`}>
              {n.label}
            </Link>
          ))}
        {me.organizations.length > 0 && (
          <Link href="/" className="nav-link">
            ← Müşteri ekranı
          </Link>
        )}
        <div className="sidebar-footer">
          <div style={{ color: '#fff' }}>{me.fullName}</div>
          <div>Platform yöneticisi</div>
          <button type="button" onClick={logout} style={{ marginTop: 8 }}>
            Çıkış yap
          </button>
        </div>
      </nav>
      <main className="main">
        {me.isPlatformAdmin ? (
          children
        ) : (
          <div className="card">
            <Empty title="Bu sayfaya erişiminiz yok">Yönetim paneli yalnızca platform yöneticilerine açıktır.</Empty>
          </div>
        )}
      </main>
    </div>
  );
}
