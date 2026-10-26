'use client';

import Link from 'next/link';
import { ReactNode } from 'react';
import { portalLogout } from '@/lib/portal-api';

export const PORTAL_BRAND = 'KVK Eğitim Portalı';

/** Katılımcının oturum açtıktan sonra gördüğü sayfaların iskeleti. */
export function PortalShell({ children }: { children: ReactNode }) {
  return (
    <div className="portal">
      <header className="portal-top">
        <Link href="/egitim/panel" style={{ color: '#fff', textDecoration: 'none', fontWeight: 700 }}>
          {PORTAL_BRAND}
        </Link>
        <span className="actions">
          <button type="button" onClick={portalLogout}>
            Çıkış yap
          </button>
        </span>
      </header>
      <main className="portal-main">{children}</main>
    </div>
  );
}
