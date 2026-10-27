import { ReactNode } from 'react';
import { Logo } from './logo';

export function AuthCard({
  title,
  subtitle,
  brand = 'KVK Yönetim Sistemi',
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  brand?: string;
  children: ReactNode;
}) {
  return (
    <main className="auth-page">
      <div className="auth-card">
        <Logo height={68} />
        <div className="brand-line">{brand}</div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
        {children}
      </div>
    </main>
  );
}
