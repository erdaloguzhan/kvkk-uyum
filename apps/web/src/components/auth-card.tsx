import { ReactNode } from 'react';

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
        <div className="brand-line">{brand}</div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
        {children}
      </div>
    </main>
  );
}
