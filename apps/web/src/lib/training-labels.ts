import type { TestType, TrainingSummary } from './types';

export const TRAINING_STATUS: Record<TrainingSummary['status'], { label: string; kind?: 'success' | 'warning' }> = {
  draft: { label: 'Taslak', kind: 'warning' },
  active: { label: 'Yayında', kind: 'success' },
};

export const TEST_LABELS: Record<TestType, string> = { pre: 'Ön test', post: 'Son test' };

/** "90 sn", "2 dk 30 sn" */
export function durationText(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (!m) return `${s} sn`;
  return s ? `${m} dk ${s} sn` : `${m} dk`;
}
