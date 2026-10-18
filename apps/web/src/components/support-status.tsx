'use client';

import { SUPPORT_STATUSES, SupportStatus } from '@kvkk/shared';
import { Badge } from './ui';

const KIND = { open: 'warning', answered: 'info', closed: undefined } as const;

export function SupportStatusBadge({ status }: { status: SupportStatus }) {
  return <Badge kind={KIND[status]}>{SUPPORT_STATUSES[status]}</Badge>;
}

/** Talep açılışından ilk yanıta geçen süre ("2 sa 15 dk"). */
export function responseTime(createdAt: string, firstResponseAt: string | null): string {
  if (!firstResponseAt) return '—';
  const minutes = Math.max(0, Math.round((new Date(firstResponseAt).getTime() - new Date(createdAt).getTime()) / 60_000));
  if (minutes < 60) return `${minutes} dk`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} sa ${minutes % 60} dk`;
  return `${Math.floor(hours / 24)} gün ${hours % 24} sa`;
}
