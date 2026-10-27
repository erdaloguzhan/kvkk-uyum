'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';
import { AuthCard } from '@/components/auth-card';
import { Loading } from '@/components/ui';
import { roleTarget, SelectableRole, selectableRoles, useSession } from '@/lib/session';

function safeNext(value: string | null): string {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/';
}

const isCurrent = (a: SelectableRole['role'], b: SelectableRole['role'] | null) =>
  !!b && a.kind === b.kind && (a.kind !== 'org' || (b.kind === 'org' && a.orgId === b.orgId));

/** Rol seçimi: birden çok rolü olan kişi girişte ve menüdeki "Rol değiştir" ile buraya gelir. */
function RoleChooser() {
  const router = useRouter();
  const params = useSearchParams();
  const { me, loading, role, chooseRole, logout } = useSession();
  const next = safeNext(params.get('sonra'));

  useEffect(() => {
    if (!loading && !me) router.replace(`/giris?sonra=${encodeURIComponent('/rol-sec')}`);
  }, [loading, me, router]);

  if (loading || !me) return <Loading />;
  const roles = selectableRoles(me);

  return (
    <AuthCard
      title="Rol seçin"
      greeting={{ fullName: me.fullName, text: 'KVK Uyum Yönetim Sistemine bu oturumda hangi rolle giriş yapacağınızı seçin.' }}
    >
      <div className="role-list">
        {roles.map((r) => (
          <button
            key={r.role.kind === 'org' ? r.role.orgId : r.role.kind}
            type="button"
            className={`role-option${isCurrent(r.role, role) ? ' current' : ''}`}
            onClick={() => {
              chooseRole(r.role);
              router.replace(roleTarget(r.role, next));
            }}
          >
            <strong>{r.title}</strong>
            <span className="muted small">{r.detail}</span>
          </button>
        ))}
        {roles.length === 0 && <p className="muted">Seçilebilecek bir rolünüz yok.</p>}
      </div>
      <div className="auth-links">
        <Link href="/profil">Profilim</Link>
        <button type="button" className="btn-link" onClick={logout}>
          Çıkış yap
        </button>
      </div>
    </AuthCard>
  );
}

export default function RoleChooserPage() {
  return (
    <Suspense>
      <RoleChooser />
    </Suspense>
  );
}
