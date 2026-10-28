'use client';

import Link from 'next/link';
import { ProfilePage } from '@/components/change-password-form';
import { useSession } from '@/lib/session';

export default function Profile() {
  const { me, org } = useSession();
  if (!me) return null;
  return (
    <ProfilePage
      fullName={me.fullName}
      email={me.email}
      phone={me.phone}
      role={org?.role.name}
      // Destek menüden kalktı (Erdal'ın menü çizimi, 28.10.2026); talepler buradan açılır.
      extra={
        org && (
          <div className="card">
            <h2>Destek</h2>
            <p className="small muted">Sistemle ilgili sorularınızı ve sorunlarınızı destek talebiyle iletebilirsiniz.</p>
            <Link className="btn btn-small" href="/destek">
              Destek talepleri
            </Link>
          </div>
        )
      }
    />
  );
}
