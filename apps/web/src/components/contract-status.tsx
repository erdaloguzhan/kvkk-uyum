'use client';

import { CONTRACT_STATUSES } from '@kvkk/shared';
import type { Contract } from '@/lib/types';
import { Badge } from './ui';

/** Bitiş tarihi bu kadar gün içinde olan aktif sözleşmeler "yakında bitiyor" olarak işaretlenir. */
export const ENDING_SOON_DAYS = 30;

const STATUS_KIND = { draft: undefined, active: 'success', expired: 'warning', terminated: 'danger' } as const;

/** Statü etiketi; aktif sözleşmenin bitiş tarihi geçtiyse veya yaklaştıysa ayrıca uyarı gösterir. */
export function contractStatusBadge(c: Pick<Contract, 'status' | 'daysToEnd'>) {
  const warn =
    c.status === 'active' && c.daysToEnd !== null
      ? c.daysToEnd < 0
        ? <Badge kind="danger">Bitiş tarihi geçti</Badge>
        : c.daysToEnd <= ENDING_SOON_DAYS
          ? <Badge kind="warning">{c.daysToEnd === 0 ? 'Bugün bitiyor' : `${c.daysToEnd} gün kaldı`}</Badge>
          : null
      : null;
  return (
    <>
      <Badge kind={STATUS_KIND[c.status]}>{CONTRACT_STATUSES[c.status]}</Badge>
      {warn && <> {warn}</>}
    </>
  );
}
