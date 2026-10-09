'use client';

import { PERMISSIONS, Permission } from '@kvkk/shared';
import { useMemo } from 'react';
import { useSession } from './session';
import type { Member } from './types';
import { useApi } from './use-api';

export interface MemberOption {
  id: string;
  fullName: string;
  email: string;
}

/**
 * Kuruluşun aktif üyeleri (görev atama, onaylayıcı seçimi için). `permission` verilirse yalnızca
 * o yetkiye sahip rollerdeki üyeler döner. Üyeleri görme yetkisi yoksa yalnızca kullanıcının kendisi.
 */
export function useMembers(permission?: Permission) {
  const { me, org, can } = useSession();
  const canList = can(PERMISSIONS.USERS_READ);
  const members = useApi<{ items: Member[] }>(canList ? 'members' : null);
  const roles = useApi<{ items: { id: string; permissions: Permission[] }[] }>(canList && permission ? 'roles' : null);

  const options = useMemo<MemberOption[]>(() => {
    if (!me) return [];
    if (!canList) {
      const self = { id: me.id, fullName: me.fullName, email: me.email };
      return !permission || org?.role.permissions.includes(permission) ? [self] : [];
    }
    const allowed = permission
      ? new Set((roles.data?.items ?? []).filter((r) => r.permissions.includes(permission)).map((r) => r.id))
      : null;
    return (members.data?.items ?? [])
      .filter((m) => m.status === 'active' && (!allowed || allowed.has(m.role.id)))
      .map((m) => m.user);
  }, [me, org, canList, permission, members.data, roles.data]);

  return { options, loading: members.loading || roles.loading };
}
