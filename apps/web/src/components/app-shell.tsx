'use client';

import { PERMISSIONS, Permission } from '@kvkk/shared';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { roleHome, useSession } from '@/lib/session';
import { OrgBrand } from './logo';
import { Alert, Empty, Loading } from './ui';
import { formatDate } from '@/lib/labels';
import type { OrgMembership } from '@/lib/types';

interface NavItem {
  href: string;
  label: string;
  /** Bu yetkilerden biri varsa menüde görünür. */
  permission?: Permission | Permission[];
  /** Yönetici panelindeki adı (Erdal'ın menü çizimi, 28.10.2026). */
  approverLabel?: string;
}

/** Menü grupları çizimdeki sırayla; gruplar arasında ayraç çizilir. Destek menüden kalktı, Profilim sayfasından açılır. */
const NAV_GROUPS: NavItem[][] = [
  [
    { href: '/', label: 'Özet' },
    { href: '/kurulus', label: 'Kuruluş Bilgileri', permission: PERMISSIONS.ORG_READ },
    { href: '/dokumanlar', label: 'KVK Dokümanları', permission: PERMISSIONS.DOCUMENTS_READ },
    { href: '/envanter', label: 'Kişisel Veri Envanteri', permission: PERMISSIONS.INVENTORY_READ },
  ],
  [
    { href: '/sozlesmeler', label: 'KVK Sözleşmeleri', permission: PERMISSIONS.CONTRACTS_READ },
    { href: '/imha', label: 'Kişisel Veri İmha Yönetimi', approverLabel: 'Kişisel Veri İmha', permission: PERMISSIONS.DESTRUCTION_READ },
  ],
  [
    { href: '/ihlaller', label: 'Veri İhlalleri', permission: PERMISSIONS.INCIDENTS_READ },
    { href: '/basvurular', label: 'İlgili Kişi Başvuruları', permission: PERMISSIONS.REQUESTS_READ },
  ],
  [
    { href: '/gorevler', label: 'Görevler', permission: PERMISSIONS.TASKS_READ },
    { href: '/bildirimler', label: 'Bildirimler' },
    { href: '/kayitlar', label: 'İşlem Kayıtları', permission: PERMISSIONS.AUDIT_READ },
  ],
];

/** Yönetici panelinde imha grubu ihlal/başvuru grubunun altına iner (çizimdeki sıra). */
const APPROVER_GROUPS: NavItem[][] = [NAV_GROUPS[0], [...NAV_GROUPS[2], NAV_GROUPS[1][1]], NAV_GROUPS[3]];

/** Menüde olmayan ama yetki kontrolü yapılan bölümler. */
const EXTRA: NavItem[] = [{ href: '/destek', label: 'Destek' }];
const NAV = [...NAV_GROUPS.flat(), ...EXTRA];

/** Panel başlığındaki rol adı. */
const PANEL_TITLE: Record<string, string> = {
  kvkk_officer: 'KVK Sorumlusu Paneli',
  approver: 'KVK Yöneticisi Paneli',
  officer_approver: 'KVK Sorumlusu ve Yöneticisi Paneli',
};

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
  const isApprover = org?.role.key === 'approver';
  const groups = (isApprover ? APPROVER_GROUPS : NAV_GROUPS).map((g) => g.filter(allowed)).filter((g) => g.length > 0);
  const panelTitle = (org && PANEL_TITLE[org.role.key]) ?? 'Paneli';
  // Menüde görünmeyen bir bölümün adresine doğrudan gidilirse sayfa yerine tek bir yetki mesajı gösterilir.
  const blocked = NAV.some((n) => n.href !== '/' && isActive(pathname, n.href) && !allowed(n));

  return (
    <div className="shell">
      <header className="topbar">
        <button type="button" aria-label="Menü" onClick={() => setMenuOpen(true)}>
          ☰
        </button>
        <strong>KVK Uyum Yönetim Sistemi</strong>
      </header>
      {menuOpen && <div className="backdrop" onClick={() => setMenuOpen(false)} />}
      <nav className={`sidebar${menuOpen ? ' open' : ''}`} aria-label="Ana menü">
        <div className="brand">
          {org && <OrgBrand name={org.name} logoUpdatedAt={org.logoUpdatedAt} />}
          KVK Uyum Yönetim Sistemi
          <small>{panelTitle}</small>
        </div>
        {org &&
          groups.map((g, i) => (
            <div key={i} className="nav-group">
              {g.map((n) => (
                <Link key={n.href} href={n.href} className={`nav-link${isActive(pathname, n.href) ? ' active' : ''}`}>
                  {(isApprover && n.approverLabel) || n.label}
                  {n.href === '/bildirimler' && unread > 0 && <span className="nav-badge">{unread}</span>}
                </Link>
              ))}
            </div>
          ))}
        <div className="sidebar-footer">
          <div style={{ color: '#fff' }}>{me.fullName}</div>
          {org && (
            <div>
              {org.role.name} · {org.name}
            </div>
          )}
          <div className="sidebar-actions">
            <Link href="/profil" className={pathname === '/profil' ? 'active' : undefined}>
              Profil
            </Link>
            <button type="button" onClick={logout}>
              Çıkış
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
          <>
            {org && <LicenseNotice org={org} />}
            {children}
          </>
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

const DAY_MS = 24 * 60 * 60 * 1000;
/** Lisans bitmeden bu kadar gün önce uyarı gösterilir. */
const LICENSE_WARNING_DAYS = 14;

/**
 * Lisans süresi dolduysa kuruluş yalnızca okuma kipindedir (API değişiklikleri reddeder); bitişe az kaldıysa
 * hatırlatma gösterilir.
 */
function LicenseNotice({ org }: { org: OrgMembership }) {
  const expiresAt = org.licenseExpiresAt ? new Date(org.licenseExpiresAt) : null;
  const date = org.licenseExpiresAt ? formatDate(org.licenseExpiresAt) : null;
  const what = org.licenseStatus === 'trial' ? 'Deneme süreniz' : 'Lisans süreniz';
  if (org.licenseStatus === 'expired' || (expiresAt && expiresAt.getTime() < Date.now())) {
    return (
      <Alert kind="warning">
        {what} {date ? `${date} tarihinde ` : ''}doldu. Kayıtlarınızı görüntüleyip indirebilirsiniz, ancak yeni kayıt ekleyemez ve
        değişiklik yapamazsınız. Lisansınızı yenilemek için <Link href="/destek">Destek</Link> bölümünden bize yazın.
      </Alert>
    );
  }
  if (!expiresAt) return null;
  const days = Math.ceil((expiresAt.getTime() - Date.now()) / DAY_MS);
  if (days > LICENSE_WARNING_DAYS) return null;
  return (
    <Alert kind="info">
      {what} {date} tarihinde doluyor ({days} gün kaldı). Süre dolunca kayıtlarınızı yalnızca görüntüleyebilirsiniz; yenilemek için{' '}
      <Link href="/destek">Destek</Link> bölümünden bize yazın.
    </Alert>
  );
}
