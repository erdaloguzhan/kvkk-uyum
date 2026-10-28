'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Empty, Loading } from './ui';
import { Logo } from './logo';

interface NavItem {
  href: string;
  label: string;
  /** Eğitimciler de görür (yalnızca platform yöneticisi değil). */
  trainer?: boolean;
}

/** Menü grupları Erdal'ın menü çizimindeki sırayla (28.10.2026). */
const NAV: NavItem[] = [
  { href: '/admin', label: 'Kuruluşlar' },
  { href: '/admin/sablonlar', label: 'KVK Dokümanları (şablon)' },
  { href: '/admin/envanter-sablonu', label: 'Kişisel Veri Envanteri (şablon)' },
];

const TRAINING_NAV: NavItem[] = [
  { href: '/admin/egitim', label: 'Eğitimler', trainer: true },
  { href: '/admin/egitim/gruplar', label: 'Eğitim Grupları', trainer: true },
  { href: '/admin/egitim/egitimciler', label: 'Eğitimciler' },
];

const SUPPORT_NAV: NavItem[] = [{ href: '/admin/destek', label: 'Destek Talepleri' }];

/** Eğitmen panelinde: Yöneticinin atadığı görevler ve bildirimler. */
const TRAINER_WORK_NAV: NavItem[][] = [[{ href: '/admin/gorevler', label: 'Görevler' }], [{ href: '/admin/bildirimler', label: 'Bildirimler' }]];

/** Menüde olmayan eğitim alt sayfaları (sınav sonuçlarına Eğitim Grupları sayfasından gidilir). */
const TRAINING_SUBPAGES = [...TRAINING_NAV.filter((n) => n.href !== '/admin/egitim').map((n) => n.href), '/admin/egitim/sonuclar'];

function isActive(pathname: string, href: string) {
  // Eğitmen görevleri admin panelinde Eğitimciler sayfasından açılır.
  if (href === '/admin/egitim/egitimciler') return pathname.startsWith(href) || pathname.startsWith('/admin/gorevler');
  if (href === '/admin') return pathname === '/admin' || pathname.startsWith('/admin/kuruluslar');
  if (href === '/admin/egitim/gruplar') return pathname.startsWith(href) || pathname.startsWith('/admin/egitim/sonuclar');
  if (href === '/admin/egitim') {
    return pathname.startsWith('/admin/egitim') && !TRAINING_SUBPAGES.some((p) => pathname.startsWith(p));
  }
  return pathname.startsWith(href);
}

/** Eğitimci (platform yöneticisi değil) bu sayfayı görebilir mi. */
const trainerAllowed = (pathname: string) =>
  pathname === '/admin/profil' ||
  pathname === '/admin/gorevler' ||
  pathname === '/admin/bildirimler' ||
  (pathname.startsWith('/admin/egitim') && !pathname.startsWith('/admin/egitim/egitimciler'));

/**
 * Yönetim paneli. Platform yöneticileri kuruluşları, doküman şablonlarını ve eğitim modülünü; eğitimciler
 * yalnızca eğitim bölümünü görür.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const { me, loading, role, chooseRole, logout } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [openTickets, setOpenTickets] = useState(0);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!loading && !me) router.replace(`/giris?sonra=${encodeURIComponent(pathname)}`);
  }, [loading, me, pathname, router]);

  useEffect(() => setMenuOpen(false), [pathname]);

  // Yönetim panelinde rol: eğitmen rolündeki kişi eğitim sayfalarında eğitmen kalır; platform yöneticisi
  // /admin adresinden (eğitim dışı bir sayfadan) girince platform yöneticisi rolüne geçer.
  const panelRole: 'admin' | 'trainer' | null = !me
    ? null
    : me.isPlatformAdmin && (role?.kind !== 'trainer' || !me.isTrainer || !trainerAllowed(pathname))
      ? 'admin'
      : me.isTrainer
        ? 'trainer'
        : null;
  useEffect(() => {
    if (panelRole && role?.kind !== panelRole) chooseRole({ kind: panelRole });
  }, [panelRole, role, chooseRole]);

  // Yanıt bekleyen destek talebi sayısı dakikada bir yenilenir.
  const isAdmin = panelRole === 'admin';
  useEffect(() => {
    if (!isAdmin) return;
    let stopped = false;
    const load = () =>
      api<{ open: number }>('admin/support/summary')
        .then((r) => !stopped && setOpenTickets(r.open))
        .catch(() => undefined);
    load();
    const timer = setInterval(load, 60_000);
    window.addEventListener('kvkk:support', load);
    return () => {
      stopped = true;
      clearInterval(timer);
      window.removeEventListener('kvkk:support', load);
    };
  }, [isAdmin]);

  // Eğitmenin okunmamış bildirim sayısı dakikada bir yenilenir.
  const isTrainerPanel = panelRole === 'trainer';
  useEffect(() => {
    if (!isTrainerPanel) return;
    let stopped = false;
    const load = () =>
      api<{ unreadCount: number }>('training-admin/notifications', { query: { unread: true } })
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
  }, [isTrainerPanel]);

  // Eğitimcinin açılış sayfası eğitimlerdir.
  const trainerHome = panelRole === 'trainer' && pathname === '/admin';
  useEffect(() => {
    if (trainerHome) router.replace('/admin/egitim');
  }, [trainerHome, router]);

  if (loading || !me || trainerHome) return <Loading />;
  const allowed = isAdmin || (panelRole === 'trainer' && trainerAllowed(pathname)) || pathname === '/admin/profil';
  const panelTitle = isAdmin ? 'Admin Paneli' : panelRole === 'trainer' ? 'Eğitmen Paneli' : 'Yönetim Paneli';
  const link = (n: NavItem) => (
    <Link key={n.href} href={n.href} className={`nav-link${isActive(pathname, n.href) ? ' active' : ''}`}>
      {n.label}
      {n.href === '/admin/destek' && openTickets > 0 && <span className="nav-badge">{openTickets}</span>}
      {n.href === '/admin/bildirimler' && unread > 0 && <span className="nav-badge">{unread}</span>}
    </Link>
  );

  return (
    <div className="shell">
      <header className="topbar">
        <button type="button" aria-label="Menü" onClick={() => setMenuOpen(true)}>
          ☰
        </button>
        <Logo height={34} onDark />
        <strong>{panelTitle}</strong>
      </header>
      {menuOpen && <div className="backdrop" onClick={() => setMenuOpen(false)} />}
      <nav className={`sidebar${menuOpen ? ' open' : ''}`} aria-label="Yönetim menüsü">
        <div className="brand">
          <Logo onDark />
          KVK Uyum Yönetim Sistemi
          <small>{panelTitle}</small>
        </div>
        {isAdmin && <div className="nav-group">{NAV.map(link)}</div>}
        {panelRole && <div className="nav-group">{TRAINING_NAV.filter((n) => isAdmin || n.trainer).map(link)}</div>}
        {isAdmin && <div className="nav-group">{SUPPORT_NAV.map(link)}</div>}
        {isTrainerPanel &&
          TRAINER_WORK_NAV.map((g) => (
            <div key={g[0].href} className="nav-group">
              {g.map(link)}
            </div>
          ))}
        <div className="sidebar-footer">
          <div style={{ color: '#fff' }}>{me.fullName}</div>
          <div>{isAdmin ? 'Platform yöneticisi' : panelRole === 'trainer' ? 'Eğitmen' : ''}</div>
          <div className="sidebar-actions">
            <Link href="/admin/profil" className={pathname === '/admin/profil' ? 'active' : undefined}>
              Profil
            </Link>
            <button type="button" onClick={logout}>
              Çıkış
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
