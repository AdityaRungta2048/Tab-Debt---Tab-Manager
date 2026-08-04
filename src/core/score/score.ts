import type { DebtInput } from '@/types/tab';
import type { DebtScore } from '@/types/suggestion';
import {
  concentrationFactor,
  countFactor,
  duplicateFactor,
  neverOpenedFactor,
  sprawlFactor,
  stalenessFactor,
  TOTAL_CAP,
} from './factors';

export const THRESHOLDS = { good: 33, warn: 66 } as const;

export function scoreState(value: number): DebtScore['state'] {
  if (value <= THRESHOLDS.good) return 'good';
  if (value <= THRESHOLDS.warn) return 'warn';
  return 'bad';
}

/**
 * The debt score: a pure function of a snapshot. No clock of its own (the clock is in the
 * snapshot), no storage, no Chrome. That is what makes it testable at the boundaries and
 * what stops it from drifting between the popup and the dashboard.
 *
 * 0-100, higher is worse. Factor caps sum to 100, so the value is the sum of its parts —
 * a user can always account for every point on screen.
 */
export function computeScore(input: DebtInput, trackingParams?: string[]): DebtScore {
  const factors = [
    countFactor(input),
    duplicateFactor(input, trackingParams),
    stalenessFactor(input),
    neverOpenedFactor(input),
    concentrationFactor(input),
    sprawlFactor(input),
  ];

  const raw = factors.reduce((sum, f) => sum + f.points, 0);
  const value = Math.round(Math.min(100, Math.max(0, (raw / TOTAL_CAP) * 100)));

  return {
    value,
    state: scoreState(value),
    // Sorted by contribution: the UI renders the breakdown in this order, so the biggest
    // lever is always the first thing the eye lands on.
    factors: factors.sort((a, b) => b.points - a.points || a.label.localeCompare(b.label)),
  };
}

/** An empty browser has no debt. Called out explicitly so the empty state is not a divide-by-zero. */
export function emptyScore(): DebtScore {
  return { value: 0, state: 'good', factors: [] };
}
