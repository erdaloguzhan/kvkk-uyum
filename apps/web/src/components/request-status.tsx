'use client';

import { DSR_OUTCOMES, DSR_STATUSES } from '@kvkk/shared';
import type { DataSubjectRequestSummary } from '@/lib/types';
import { Badge } from './ui';

const STATUS_KIND = { new: 'info', in_review: undefined, awaiting_info: 'warning', answered: 'success' } as const;

/** Durum etiketi; açık başvuruda kurum içi hedefe veya yasal son güne kalan süreyi de gösterir. */
export function requestStatusBadge(r: Pick<DataSubjectRequestSummary, 'status' | 'daysToTarget' | 'daysToLegal' | 'overdue' | 'legalOverdue' | 'answerOutcome'>) {
  let deadline = null;
  if (r.legalOverdue) deadline = <Badge kind="danger">Yasal süre {-r.daysToLegal!} gün geçti</Badge>;
  else if (r.overdue) deadline = <Badge kind="danger">Hedef geçti · yasal süreye {r.daysToLegal} gün</Badge>;
  else if (r.status === 'awaiting_info') deadline = <Badge>Süre durdu</Badge>;
  else if (r.daysToTarget !== null) {
    deadline = <Badge kind={r.daysToTarget <= 5 ? 'warning' : undefined}>{r.daysToTarget === 0 ? 'Hedef bugün' : `Hedefe ${r.daysToTarget} gün`}</Badge>;
  }
  return (
    <>
      <Badge kind={STATUS_KIND[r.status]}>{DSR_STATUSES[r.status]}</Badge>
      {r.status === 'answered' && r.answerOutcome && <> <Badge>{DSR_OUTCOMES[r.answerOutcome]}</Badge></>}
      {deadline && <> {deadline}</>}
    </>
  );
}
