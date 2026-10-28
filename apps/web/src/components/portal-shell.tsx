'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';
import { portalLogout } from '@/lib/portal-api';
import { Logo } from './logo';

export const PORTAL_BRAND = 'KVK Uyum Yönetim Sistemi Çalışan Paneli';

/** Çalışan paneli menüsü (Erdal'ın menü çizimi, 28.10.2026). */
const NAV = [
  { href: '/egitim/panel', label: 'Özet' },
  { href: '/egitim/dokumanlar', label: 'KVK Dokümanları', also: '/egitim/dokuman/' },
  { href: '/egitim/egitimlerim', label: 'Eğitimlerim', also: '/egitim/ders/' },
];

/** Çalışanın oturum açtıktan sonra gördüğü sayfaların iskeleti. */
export function PortalShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => setMenuOpen(false), [pathname]);
  const active = (n: (typeof NAV)[number]) => pathname === n.href || (!!n.also && pathname.startsWith(n.also));

  return (
    <div className="shell">
      <header className="topbar">
        <button type="button" aria-label="Menü" onClick={() => setMenuOpen(true)}>
          ☰
        </button>
        <Logo height={34} onDark />
        <strong>Çalışan Paneli</strong>
      </header>
      {menuOpen && <div className="backdrop" onClick={() => setMenuOpen(false)} />}
      <nav className={`sidebar${menuOpen ? ' open' : ''}`} aria-label="Çalışan menüsü">
        <div className="brand">
          <Logo onDark />
          KVK Uyum Yönetim Sistemi
          <small>Çalışan Paneli</small>
        </div>
        <div className="nav-group">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={`nav-link${active(n) ? ' active' : ''}`}>
              {n.label}
            </Link>
          ))}
        </div>
        <div className="sidebar-footer">
          <div className="sidebar-actions">
            <Link href="/egitim/profil" className={pathname === '/egitim/profil' ? 'active' : undefined}>
              Profil
            </Link>
            <button type="button" onClick={portalLogout}>
              Çıkış
            </button>
          </div>
        </div>
      </nav>
      <main className="main">{children}</main>
    </div>
  );
}
