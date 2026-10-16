'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';
import { useSession } from '@/lib/session';
import { Empty, Loading } from './ui';

interface NavItem {
  href: string;
  label: string;
  /** Eğitimciler de görür (yalnızca platform yöneticisi değil). */
  trainer?: boolean;
}

const NAV: NavItem[] = [
  { href: '/admin', label: 'Kuruluşlar' },
  { href: '/admin/sablonlar', label: 'Doküman şablonları' },
];

const TRAINING_NAV: NavItem[] = [
  { href: '/admin/egitim', label: 'Eğitimler', trainer: true },
  { href: '/admin/egitim/gruplar', label: 'Eğitim grupları', trainer: true },
  { href: '/admin/egitim/sonuclar', label: 'Sınav sonuçları', trainer: true },
  { href: '/admin/egitim/egitimciler', label: 'Eğitimciler' },
];

const TRAINING_SUBPAGES = TRAINING_NAV.filter((n) => n.href !== '/admin/egitim').map((n) => n.href);

function isActive(pathname: string, href: string) {
  if (href === '/admin') return pathname === '/admin' || pathname.startsWith('/admin/kuruluslar');
  if (href === '/admin/egitim') {
    return pathname.startsWith('/admin/egitim') && !TRAINING_SUBPAGES.some((p) => pathname.startsWith(p));
  }
  return pathname.startsWith(href);
}

/** Eğitimci (platform yöneticisi değil) bu sayfayı görebilir mi. */
const trainerAllowed = (pathname: string) =>
  pathname === '/admin/profil' || (pathname.startsWith('/admin/egitim') && !pathname.startsWith('/admin/egitim/egitimciler'));

/**
 * Yönetim paneli. Platform yöneticileri kuruluşları, doküman şablonlarını ve eğitim modülünü; eğitimciler
 * yalnızca eğitim bölümünü görür.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const { me, loading, logout } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!loading && !me) router.replace(`/giris?sonra=${encodeURIComponent(pathname)}`);
  }, [loading, me, pathname, router]);

  useEffect(() => setMenuOpen(false), [pathname]);

  // Eğitimcinin açılış sayfası eğitimlerdir.
  const trainerHome = !!me && !me.isPlatformAdmin && me.isTrainer && pathname === '/admin';
  useEffect(() => {
    if (trainerHome) router.replace('/admin/egitim');
  }, [trainerHome, router]);

  if (loading || !me || trainerHome) return <Loading />;
  const allowed = me.isPlatformAdmin || (me.isTrainer && trainerAllowed(pathname)) || pathname === '/admin/profil';
  const link = (n: NavItem) => (
    <Link key={n.href} href={n.href} className={`nav-link${isActive(pathname, n.href) ? ' active' : ''}`}>
      {n.label}
    </Link>
  );

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
        {me.isPlatformAdmin && NAV.map(link)}
        {(me.isPlatformAdmin || me.isTrainer) && (
          <>
            <div className="nav-section">Uzaktan eğitim</div>
            {TRAINING_NAV.filter((n) => me.isPlatformAdmin || n.trainer).map(link)}
          </>
        )}
        {me.organizations.length > 0 && (
          <Link href="/" className="nav-link">
            ← Müşteri ekranı
          </Link>
        )}
        <div className="sidebar-footer">
          <div style={{ color: '#fff' }}>{me.fullName}</div>
          <div>{me.isPlatformAdmin ? 'Platform yöneticisi' : me.isTrainer ? 'Eğitimci' : ''}</div>
          <div className="sidebar-actions">
            <Link href="/admin/profil" className={pathname === '/admin/profil' ? 'active' : undefined}>
              Profilim / şifre değiştir
            </Link>
            <button type="button" onClick={logout}>
              Çıkış yap
            </button>
          </div>
        </div>
      </nav>
      <main className="main">
        {allowed ? (
          children
        ) : (
          <div className="card">
            <Empty title="Bu sayfaya erişiminiz yok">
              {me.isTrainer
                ? 'Eğitimci hesabıyla yalnızca eğitim bölümünü kullanabilirsiniz.'
                : 'Yönetim paneli yalnızca platform yöneticilerine açıktır.'}
            </Empty>
          </div>
        )}
      </main>
    </div>
  );
}
