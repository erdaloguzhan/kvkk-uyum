import type { Metadata } from 'next';
import { AdminShell } from '@/components/admin-shell';

export const metadata: Metadata = { title: 'Yönetim paneli' };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
