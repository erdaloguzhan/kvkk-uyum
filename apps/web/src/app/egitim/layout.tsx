import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Eğitim Portalı' };

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return children;
}
