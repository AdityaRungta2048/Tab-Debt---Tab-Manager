import type { DailyRow } from '@/types/storage';

/**
 * Analytics over the per-day roll-ups. Pure: rows in, plain series out.
 *
 * Everything here reads `td.daily.v1`, which holds ONE row per day and is pruned at 180.
 * There is no per-event history to mine, by design (see ARCHITECTURE.md) — so these
 * functions must be honest about gaps rather than inventing points to make a line smooth.
 */

export type Point = { day: string; value: number };

const DAY = 86_400_000;

export function parseDay(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

export function toDay(ts: number): string {
  const date = new Date(ts);
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `${date.getUTCFullYear()}-${mm}-${dd}`;
}

/** Rows sorted oldest-first, trimmed to the last `days`. */
export function window(rows: DailyRow[], days: number): DailyRow[] {
  return [...rows].sort((a, b) => a.day.localeCompare(b.day)).slice(-days);
}

export function series(rows: DailyRow[], key: 'tabs' | 'score' | 'closed' | 'cleanups'): Point[] {
  return window(rows, rows.length).map((r) => ({ day: r.day, value: r[key] }));
}

export type Trend = {
  points: Point[];
  first: number;
  last: number;
  /** Net change across the window. Positive means the debt grew. */
  change: number;
  min: number;
  max: number;
};

export function trend(rows: DailyRow[], key: 'tabs' | 'score', days = 30): Trend {
  const points = series(window(rows, days), key);
  const values = points.map((p) => p.value);
  const first = values[0] ?? 0;
  const last = values[values.length - 1] ?? 0;
  return {
    points,
    first,
    last,
    change: last - first,
    min: values.length ? Math.min(...values) : 0,
    max: values.length ? Math.max(...values) : 0,
  };
}

export type CategorySeries = {
  category: string;
  points: Point[];
  latest: number;
};

/**
 * Category counts over time, biggest-latest first. Only categories that ever appear are
 * returned — a legend full of permanent zeroes is noise.
 */
export function categoryTrends(rows: DailyRow[], days = 30, limit = 6): CategorySeries[] {
  const windowed = window(rows, days);
  const names = new Set<string>();
  for (const row of windowed) {
    for (const [name, count] of Object.entries(row.byCategory)) {
      if (count > 0) names.add(name);
    }
  }

  const out: CategorySeries[] = [...names].map((category) => {
    const points = windowed.map((r) => ({ day: r.day, value: r.byCategory[category] ?? 0 }));
    return { category, points, latest: points[points.length - 1]?.value ?? 0 };
  });

  return out
    .sort((a, b) => b.latest - a.latest || a.category.localeCompare(b.category))
    .slice(0, limit);
}

export type CleanupStats = {
  /** Consecutive days, ending today or yesterday, on which something was cleaned up. */
  streak: number;
  longestStreak: number;
  totalClosed: number;
  totalCleanups: number;
  /** Days in the window on which the user cleaned up at all. */
  activeDays: number;
};

/**
 * The streak.
 *
 * Deliberately forgiving at the near end: a streak survives a day that has not finished
 * yet. Counting from today alone would show "0 days" every morning until the user acted,
 * which punishes them for the clock rather than reporting their behaviour — and this
 * product does not scold. It is NOT forgiving in the middle: a genuine missed day ends it.
 */
export function cleanupStats(rows: DailyRow[], now: number): CleanupStats {
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const cleaned = (day: string): boolean => (byDay.get(day)?.cleanups ?? 0) > 0;

  let streak = 0;
  // Start from yesterday if today has no activity yet; today is still in progress.
  let cursor = cleaned(toDay(now)) ? now : now - DAY;
  while (cleaned(toDay(cursor))) {
    streak += 1;
    cursor -= DAY;
  }

  // Longest run anywhere in the stored history.
  const days = [...byDay.keys()].sort();
  let longest = 0;
  let run = 0;
  let previous: number | null = null;
  for (const day of days) {
    const ts = parseDay(day);
    const consecutive = previous !== null && ts - previous === DAY;
    if (!cleaned(day)) {
      run = 0;
      previous = ts;
      continue;
    }
    run = consecutive && run > 0 ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = ts;
  }

  return {
    streak,
    longestStreak: Math.max(longest, streak),
    totalClosed: rows.reduce((n, r) => n + r.closed, 0),
    totalCleanups: rows.reduce((n, r) => n + r.cleanups, 0),
    activeDays: rows.filter((r) => r.cleanups > 0).length,
  };
}

/** Plain-language summary of the trend. Diagnostic, never congratulatory or scolding. */
export function describeTrend(t: Trend, unit: string, pluralUnit = `${unit}s`): string {
  if (t.points.length < 2) return `Not enough history yet — check back in a few days.`;
  if (t.change === 0) return `Your ${pluralUnit} count is where it was ${t.points.length} days ago.`;
  const size = Math.abs(t.change);
  const word = size === 1 ? unit : pluralUnit;
  return `${t.change > 0 ? 'Up' : 'Down'} ${size} ${word} over ${t.points.length} days.`;
}

/**
 * Should the y-axis start at zero?
 *
 * Forcing zero on a series that lives between 740 and 800 squeezes every bit of variation
 * into the top 8% of the plot — the chart then shows a flat line and communicates nothing,
 * which is its own kind of dishonesty. So: zero-base when the data actually approaches it,
 * otherwise let the axis fit the data. The caller must drop the area fill when this returns
 * false, because a filled area DOES imply magnitude measured from zero.
 */
export function shouldIncludeZero(points: Point[]): boolean {
  if (points.length === 0) return true;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max <= 0) return true;
  return min <= max * 0.6;
}
