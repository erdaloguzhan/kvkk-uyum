import Link from 'next/link';
import { ReactNode } from 'react';
import { Logo } from './logo';

/**
 * Platformun kendi hukuki metinleri (Erdal, 04.11.2026). Metinler giriş ekranlarından yeni sekmede açılır;
 * böylece giriş formuna yazılanlar kaybolmaz. Eğitim Portalı Aydınlatma Metni yalnızca portal giriş ekranında gösterilir.
 */
export const PANEL_LEGAL = [
  { href: '/hukuki/kullanici-aydinlatma-metni', label: 'Kullanıcı Aydınlatma Metni' },
  { href: '/hukuki/cerez-aydinlatma-metni', label: 'Çerez Aydınlatma Metni' },
  { href: '/hukuki/kullanim-kosullari', label: 'Kullanım Koşulları' },
  { href: '/hukuki/basvuru-formu', label: 'İlgili Kişi Başvuru Formu' },
];

export const PORTAL_LEGAL = [{ href: '/egitim/aydinlatma-metni', label: 'Eğitim Portalı Aydınlatma Metni' }];

/** Giriş kartının altındaki hukuki metin bağlantıları. */
export function LegalLinks({ kind }: { kind: 'panel' | 'portal' }) {
  const links = kind === 'portal' ? PORTAL_LEGAL : PANEL_LEGAL;
  return (
    <nav className="auth-legal" aria-label="Hukuki metinler">
      {links.map((l) => (
        <a key={l.href} href={l.href} target="_blank" rel="noopener">
          {l.label}
        </a>
      ))}
    </nav>
  );
}

/** Hukuki metin sayfası: logo, başlık, metin ve (panel metinlerinde) diğer metinlere bağlantılar. */
export function LegalPage({
  title,
  brand = 'KVK Uyum Yönetim Sistemi',
  kind = 'panel',
  children,
}: {
  title: string;
  brand?: string;
  kind?: 'panel' | 'portal';
  children: ReactNode;
}) {
  return (
    <main className="legal-page">
      <article className="legal-doc">
        <header className="legal-head">
          <Logo height={52} />
          <div className="brand-line">{brand}</div>
        </header>
        <h1>{title}</h1>
        <div className="legal-body">{children}</div>
        {kind === 'panel' && (
          <footer className="legal-foot">
            {PANEL_LEGAL.map((l) => (
              <Link key={l.href} href={l.href}>
                {l.label}
              </Link>
            ))}
          </footer>
        )}
      </article>
    </main>
  );
}
