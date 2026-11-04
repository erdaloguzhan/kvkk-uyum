import { ReactNode } from 'react';
import { LegalLinks } from './legal';
import { Logo } from './logo';

export function AuthCard({
  title,
  subtitle,
  brand = 'KVK Uyum Yönetim Sistemi',
  greeting,
  below,
  legal,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  brand?: string;
  /** Kişiye hitap: "Sayın Ad Soyad," ve altında pencerenin amacı. */
  greeting?: { fullName: string; text: ReactNode } | null;
  /** Kartın dışında, hemen altında gösterilen içerik. */
  below?: ReactNode;
  /** Kartın altındaki hukuki metin bağlantıları: panel girişi veya Eğitim Portalı girişi. */
  legal?: 'panel' | 'portal';
  children: ReactNode;
}) {
  return (
    <main className="auth-page">
      <div className="auth-card">
        <Logo height={68} />
        <div className="brand-line">{brand}</div>
        <h1>{title}</h1>
        {greeting && (
          <p className="greeting">
            <strong>Sayın {greeting.fullName},</strong>
            <br />
            {greeting.text}
          </p>
        )}
        {subtitle && <p className="muted">{subtitle}</p>}
        {children}
      </div>
      {below && <div className="auth-below">{below}</div>}
      {legal && <LegalLinks kind={legal} />}
    </main>
  );
}
