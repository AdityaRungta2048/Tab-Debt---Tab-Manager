import { describe, it, expect } from 'vitest';
import {
  series,
  trend,
  window as windowRows,
  categoryTrends,
  cleanupStats,
  describeTrend,
  shouldIncludeZero,
  toDay,
  parseDay,
} from './series';
import type { DailyRow } from '@/types/storage';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 6, 15, 12, 0, 0);

const row = (over: Partial<DailyRow> & { day: string }): DailyRow => ({
  tabs: 100,
  score: 50,
  closed: 0,
  cleanups: 0,
  byCategory: {},
  ...over,
});

/** N consecutive days ending on `endTs`, oldest first. */
const days = (n: number, endTs: number, fn: (i: number) => Partial<DailyRow> = () => ({})): DailyRow[] =>
  Array.from({ length: n }, (_, i) => {
    const ts = endTs - (n - 1 - i) * DAY;
    return row({ day: toDay(ts), ...fn(i) });
  });

describe('day keys', () => {
  it('round-trips', () => {
    expect(parseDay(toDay(NOW))).toBe(Date.UTC(2026, 6, 15));
  });

  it('sorts lexicographically in chronological order', () => {
    const list = [toDay(NOW), toDay(NOW - 40 * DAY), toDay(NOW - DAY)];
    expect([...list].sort()).toEqual([toDay(NOW - 40 * DAY), toDay(NOW - DAY), toDay(NOW)]);
  });
});

describe('window', () => {
  it('sorts oldest-first and trims to the last N', () => {
    const rows = days(40, NOW).reverse(); // hand it unsorted
    const out = windowRows(rows, 7);
    expect(out).toHaveLength(7);
    expect(out.map((r) => r.day)).toEqual([...out.map((r) => r.day)].sort());
    expect(out[out.length - 1]!.day).toBe(toDay(NOW));
  });

  it('returns everything when the window is longer than the history', () => {
    expect(windowRows(days(3, NOW), 30)).toHaveLength(3);
  });

  it('handles no history', () => {
    expect(windowRows([], 30)).toEqual([]);
  });
});

describe('series and trend', () => {
  it('extracts a keyed series in chronological order', () => {
    const rows = days(5, NOW, (i) => ({ tabs: 100 + i }));
    expect(series(rows, 'tabs').map((p) => p.value)).toEqual([100, 101, 102, 103, 104]);
  });

  it('reports first, last, net change, min and max', () => {
    const rows = days(5, NOW, (i) => ({ tabs: [100, 140, 90, 130, 120][i] ?? 0 }));
    const t = trend(rows, 'tabs', 30);
    expect(t.first).toBe(100);
    expect(t.last).toBe(120);
    expect(t.change).toBe(20);
    expect(t.min).toBe(90);
    expect(t.max).toBe(140);
  });

  it('reports a fall as a negative change, which is the good direction here', () => {
    const rows = days(3, NOW, (i) => ({ tabs: [300, 200, 120][i] ?? 0 }));
    expect(trend(rows, 'tabs').change).toBe(-180);
  });

  it('does not throw or produce NaN on empty history', () => {
    const t = trend([], 'tabs');
    expect(t).toMatchObject({ first: 0, last: 0, change: 0, min: 0, max: 0 });
    expect(t.points).toEqual([]);
  });

  it('respects the window length', () => {
    expect(trend(days(60, NOW), 'tabs', 7).points).toHaveLength(7);
  });
});

describe('categoryTrends', () => {
  it('returns one series per category that ever appears, biggest latest first', () => {
    const rows = days(3, NOW, (i) => ({
      byCategory: { Development: 10 + i, Shopping: 5, Work: 30 - i },
    }));
    const out = categoryTrends(rows);
    expect(out.map((c) => c.category)).toEqual(['Work', 'Development', 'Shopping']);
    expect(out[0]!.points).toHaveLength(3);
    expect(out[0]!.latest).toBe(28);
  });

  it('omits categories that are always zero rather than showing a dead legend entry', () => {
    const rows = days(2, NOW, () => ({ byCategory: { Development: 5, Travel: 0 } }));
    expect(categoryTrends(rows).map((c) => c.category)).toEqual(['Development']);
  });

  it('fills a missing category on a given day with zero rather than a gap', () => {
    const rows = [
      row({ day: toDay(NOW - DAY), byCategory: { Development: 5 } }),
      row({ day: toDay(NOW), byCategory: { Shopping: 3 } }),
    ];
    const dev = categoryTrends(rows).find((c) => c.category === 'Development')!;
    expect(dev.points.map((p) => p.value)).toEqual([5, 0]);
  });

  it('caps the number of series so the chart stays readable', () => {
    const byCategory = Object.fromEntries(
      Array.from({ length: 12 }, (_, i) => [`Cat${i}`, i + 1]),
    );
    expect(categoryTrends(days(3, NOW, () => ({ byCategory })), 30, 6)).toHaveLength(6);
  });

  it('handles no history', () => {
    expect(categoryTrends([])).toEqual([]);
  });
});

describe('cleanupStats — the streak', () => {
  it('counts consecutive days ending today', () => {
    const rows = days(5, NOW, () => ({ cleanups: 1 }));
    expect(cleanupStats(rows, NOW).streak).toBe(5);
  });

  /**
   * The forgiving-at-the-near-end rule: a day that has not finished yet must not break a
   * streak, or the product would report "0 days" every morning and read as a scold.
   */
  it('survives a today with no activity yet, counting back from yesterday', () => {
    const rows = days(4, NOW - DAY, () => ({ cleanups: 1 }));
    expect(cleanupStats(rows, NOW).streak).toBe(4);
  });

  it('is broken by a genuinely missed day in the middle', () => {
    const rows = [
      ...days(3, NOW - 3 * DAY, () => ({ cleanups: 1 })),
      // NOW - 2 days: missing entirely
      row({ day: toDay(NOW - DAY), cleanups: 1 }),
      row({ day: toDay(NOW), cleanups: 1 }),
    ];
    expect(cleanupStats(rows, NOW).streak).toBe(2);
  });

  it('is broken by a present row with zero cleanups, not just a missing row', () => {
    const rows = [
      row({ day: toDay(NOW - 2 * DAY), cleanups: 1 }),
      row({ day: toDay(NOW - DAY), cleanups: 0 }),
      row({ day: toDay(NOW), cleanups: 1 }),
    ];
    expect(cleanupStats(rows, NOW).streak).toBe(1);
  });

  it('is zero when nothing has been cleaned up in two days', () => {
    const rows = days(5, NOW - 2 * DAY, () => ({ cleanups: 1 }));
    expect(cleanupStats(rows, NOW).streak).toBe(0);
  });

  it('is zero with no history at all', () => {
    expect(cleanupStats([], NOW)).toMatchObject({ streak: 0, longestStreak: 0, totalClosed: 0 });
  });

  it('reports the longest run anywhere in history, not only the current one', () => {
    const rows = [
      ...days(6, NOW - 20 * DAY, () => ({ cleanups: 1 })),
      ...days(2, NOW, () => ({ cleanups: 1 })),
    ];
    const stats = cleanupStats(rows, NOW);
    expect(stats.streak).toBe(2);
    expect(stats.longestStreak).toBe(6);
  });

  it('never reports a longest shorter than the current streak', () => {
    const rows = days(9, NOW, () => ({ cleanups: 1 }));
    const stats = cleanupStats(rows, NOW);
    expect(stats.longestStreak).toBeGreaterThanOrEqual(stats.streak);
  });

  it('totals closed tabs, cleanups and active days across the whole history', () => {
    const rows = days(4, NOW, (i) => ({ closed: (i + 1) * 10, cleanups: i % 2 }));
    const stats = cleanupStats(rows, NOW);
    expect(stats.totalClosed).toBe(10 + 20 + 30 + 40);
    expect(stats.totalCleanups).toBe(2);
    expect(stats.activeDays).toBe(2);
  });
});

describe('describeTrend — copy', () => {
  it('says so plainly when there is not enough history', () => {
    expect(describeTrend(trend([], 'tabs'), 'tab')).toContain('Not enough history');
  });

  it('reports direction and magnitude without judgement', () => {
    const up = describeTrend(trend(days(3, NOW, (i) => ({ tabs: 100 + i * 10 })), 'tabs'), 'tab');
    expect(up).toBe('Up 20 tabs over 3 days.');
    const down = describeTrend(trend(days(3, NOW, (i) => ({ tabs: 100 - i * 10 })), 'tabs'), 'tab');
    expect(down).toBe('Down 20 tabs over 3 days.');
  });

  it('handles no change', () => {
    expect(describeTrend(trend(days(3, NOW), 'tabs'), 'tab')).toContain('where it was');
  });

  it('never scolds or congratulates', () => {
    const cases = [
      describeTrend(trend(days(30, NOW, (i) => ({ tabs: 100 + i * 20 })), 'tabs'), 'tab'),
      describeTrend(trend(days(30, NOW, (i) => ({ tabs: 800 - i * 20 })), 'tabs'), 'tab'),
    ];
    for (const text of cases.map((c) => c.toLowerCase())) {
      for (const word of ['great', 'well done', 'oops', 'problem', 'should', 'too many', 'nice']) {
        expect(text).not.toContain(word);
      }
    }
  });
});

/**
 * Regression for CRITIQUE #8: forcing a zero baseline on a 740–800 series squeezed every
 * bit of variation into the top 8% of the plot, so the chart showed a flat line.
 */
describe('shouldIncludeZero', () => {
  const pts = (...values: number[]) => values.map((value, i) => ({ day: `d${i}`, value }));

  it('zero-bases a series that comes near zero', () => {
    expect(shouldIncludeZero(pts(0, 5, 12))).toBe(true);
    expect(shouldIncludeZero(pts(2, 40, 100))).toBe(true);
  });

  it('does NOT zero-base a series that lives far from it', () => {
    expect(shouldIncludeZero(pts(740, 780, 800))).toBe(false);
    expect(shouldIncludeZero(pts(94, 96, 97))).toBe(false);
  });

  it('uses 60% of the max as the boundary', () => {
    expect(shouldIncludeZero(pts(60, 100))).toBe(true);
    expect(shouldIncludeZero(pts(61, 100))).toBe(false);
  });

  it('zero-bases degenerate series rather than dividing by zero', () => {
    expect(shouldIncludeZero([])).toBe(true);
    expect(shouldIncludeZero(pts(0, 0))).toBe(true);
  });
});

describe('describeTrend — grammar', () => {
  const t = (change: number) => ({
    points: [
      { day: 'a', value: 0 },
      { day: 'b', value: change },
    ],
    first: 0,
    last: change,
    change,
    min: 0,
    max: change,
  });

  it('says "1 point", not "1 points"', () => {
    expect(describeTrend(t(1), 'point')).toBe('Up 1 point over 2 days.');
    expect(describeTrend(t(-1), 'point')).toBe('Down 1 point over 2 days.');
  });

  it('pluralises everything else', () => {
    expect(describeTrend(t(12), 'tab')).toBe('Up 12 tabs over 2 days.');
  });
});
