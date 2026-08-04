import { computeScore } from '@/core/score/score';
import { classifyAll } from '@/core/categorize/classify';
import { getSnapshot } from '@/services/tabs.service';
import { read, update } from '@/services/storage.service';
import type { DailyRow } from '@/types/storage';

/**
 * Daily roll-up. Per-EVENT rows would blow the ~10MB storage.local budget within a year;
 * one row per day costs a few hundred bytes and answers every question the analytics
 * surface actually asks. Pruned beyond 180 days.
 */

export const RETENTION_DAYS = 180;

export function dayKey(ts: number): string {
  const d = new Date(ts);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Merge today's observation into its row, replacing rather than appending. */
export function upsertRow(rows: DailyRow[], row: DailyRow): DailyRow[] {
  const idx = rows.findIndex((r) => r.day === row.day);
  const next = idx === -1 ? [...rows, row] : rows.map((r, i) => (i === idx ? { ...r, ...row } : r));
  return next.sort((a, b) => a.day.localeCompare(b.day)).slice(-RETENTION_DAYS);
}

/** Called on an alarm, not a timer: setTimeout does not survive a worker restart. */
export async function writeDailySnapshot(): Promise<void> {
  const input = await getSnapshot();
  const settings = await read.settings();
  const score = computeScore(input, settings.trackingParams);
  const cats = classifyAll(input.tabs, settings.overrides);

  const byCategory: Record<string, number> = {};
  for (const tab of input.tabs) {
    const c = cats.get(tab)?.category ?? 'Other';
    byCategory[c] = (byCategory[c] ?? 0) + 1;
  }

  const day = dayKey(input.now);
  await update.daily((state) => {
    const existing = state.rows.find((r) => r.day === day);
    return {
      ...state,
      rows: upsertRow(state.rows, {
        day,
        tabs: input.tabs.length,
        score: score.value,
        // Cumulative counters must survive the overwrite, or a second snapshot in the
        // same day silently resets the user's cleanup history to zero.
        closed: existing?.closed ?? 0,
        cleanups: existing?.cleanups ?? 0,
        byCategory,
      }),
    };
  });
}

/** Called after a bulk action, so the streak and cleanup counts reflect real work. */
export async function recordCleanup(closedCount: number): Promise<void> {
  const day = dayKey(Date.now());
  await update.daily((state) => {
    const existing = state.rows.find((r) => r.day === day);
    return {
      ...state,
      rows: upsertRow(state.rows, {
        day,
        tabs: existing?.tabs ?? 0,
        score: existing?.score ?? 0,
        closed: (existing?.closed ?? 0) + closedCount,
        cleanups: (existing?.cleanups ?? 0) + 1,
        byCategory: existing?.byCategory ?? {},
      }),
    };
  });
}
