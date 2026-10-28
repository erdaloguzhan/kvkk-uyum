'use client';

import { INCIDENT_NOTIFY_DEADLINE_HOURS, INCIDENT_STATUSES, IncidentStatus } from '@kvkk/shared';
import type { Incident } from '@/lib/types';
import { Badge } from './ui';

const KIND: Record<IncidentStatus, 'success' | 'warning' | 'danger' | 'info' | undefined> = {
  draft: undefined,
  pending_approval: 'warning',
  approved: 'info',
  notified: 'success',
  closed: undefined,
};

export const incidentStatusBadge = (s: IncidentStatus) => <Badge kind={KIND[s]}>{INCIDENT_STATUSES[s]}</Badge>;

/** 72 saat takibi: kalan süre, gecikme veya bildirimin zamanında yapılıp yapılmadığı. */
export function deadlineBadge(i: Pick<Incident, 'hoursLeft' | 'overdue' | 'notifiedOnTime' | 'notificationType'>) {
  if (i.notificationType === 'follow_up') return <span className="muted small">Takip bildirimi</span>;
  if (i.notifiedOnTime === true) return <Badge kind="success">{INCIDENT_NOTIFY_DEADLINE_HOURS} saat içinde bildirildi</Badge>;
  if (i.notifiedOnTime === false) return <Badge kind="danger">Geç bildirildi</Badge>;
  if (i.overdue) return <Badge kind="danger">Süre {-(i.hoursLeft ?? 0)} saat önce doldu</Badge>;
  if (i.hoursLeft === null) return <span className="muted small">—</span>;
  return <Badge kind={i.hoursLeft <= 24 ? 'warning' : 'info'}>{i.hoursLeft} saat kaldı</Badge>;
}
