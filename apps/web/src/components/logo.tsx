'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

/** Bi Artı Danışmanlık logosu (Erdal, 27.10.2026). Koyu zeminde beyaz kutu içinde gösterilir; lacivert kare zemine karışmasın. */
/** height verilmezse logo kutusunun genişliğini doldurur (yan menü). */
export function Logo({ height, onDark = false }: { height?: number; onDark?: boolean }) {
  return <img src="/logo.png" alt="Bi Artı Danışmanlık" className={onDark ? 'logo logo-on-dark' : 'logo'} style={height ? { height } : undefined} />;
}

/** Seçili kuruluşun firma logosu (yüklendiyse). Görsel X-Organization-Id başlığıyla alınır, bu yüzden <img src> yerine blob kullanılır. */
export function useOrgLogo(logoUpdatedAt: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!logoUpdatedAt) {
      setUrl(null);
      return;
    }
    let objectUrl: string | null = null;
    let stopped = false;
    apiFetch('organizations/current/logo', { redirect: false })
      .then((r) => r.blob())
      .then((b) => {
        if (stopped) return;
        objectUrl = URL.createObjectURL(b);
        setUrl(objectUrl);
      })
      .catch(() => !stopped && setUrl(null));
    return () => {
      stopped = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [logoUpdatedAt]);
  return url;
}

/** Kuruluş panellerinin menü başı: firma logosu varsa logo, yoksa kuruluşun ünvanı (Erdal, 28.10.2026). */
export function OrgBrand({ name, logoUpdatedAt, height }: { name: string; logoUpdatedAt: string | null; height?: number }) {
  const url = useOrgLogo(logoUpdatedAt);
  if (url) return <img src={url} alt={name} className="logo logo-on-dark" style={height ? { height } : undefined} />;
  return <span className="org-brand-name">{name}</span>;
}
