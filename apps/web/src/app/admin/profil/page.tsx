'use client';

import { ProfilePage } from '@/components/change-password-form';
import { useSession } from '@/lib/session';

export default function AdminProfile() {
  const { me } = useSession();
  if (!me) return null;
  return <ProfilePage fullName={me.fullName} email={me.email} phone={me.phone} role={me.isPlatformAdmin ? 'Platform yöneticisi' : undefined} />;
}
