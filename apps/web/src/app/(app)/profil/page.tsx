'use client';

import { ProfilePage } from '@/components/change-password-form';
import { useSession } from '@/lib/session';

export default function Profile() {
  const { me, org } = useSession();
  if (!me) return null;
  return <ProfilePage fullName={me.fullName} email={me.email} role={org?.role.name} />;
}
