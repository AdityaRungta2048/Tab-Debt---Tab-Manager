import type { DailyRow } from '@/types/storage';

/**
 * Synthetic daily history for the mock harness.
 *
 * Without this the trends view is permanently empty under `vite dev --mode mock`, because
 * the roll-up is written once a day by an alarm that never fires in a plain browser tab —
 * so the charts could only ever be reviewed by imagining them, which is exactly what the
 * fixture harness exists to prevent.
 *
 * Deterministic per seed, like every other fixture.
 */

const DAY = 86_400_000;

const CATEGORIES = [
  'Development',
  'Work',
  'Entertainment',
  'Social',
  'News',
  'Learning',
  'Shopping',
  'AI',
  'Travel',
  'Reading Later',
  'Other',
];

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateHistory(days: number, endTs: number, tabsToday: number, seed = 7): DailyRow[] {
  const r = rng(seed);
  const rows: DailyRow[] = [];

  // Work backwards from today's real tab count so the last point matches what the rest of
  // the dashboard is showing. A trend line that ends somewhere other than the number in the
  // header would be its own small lie.
  let tabs = tabsToday;

  for (let i = 0; i < days; i++) {
    const ts = endTs - i * DAY;
    const date = new Date(ts);
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(date.getUTCDate()).padStart(2, '0');

    // Cleanups cluster: people tidy in bursts, not evenly.
    const cleanedUp = r() < (i % 7 === 0 ? 0.55 : 0.18);
    const closed = cleanedUp ? Math.floor(r() * 60) + 5 : 0;

    const byCategory: Record<string, number> = {};
    let remaining = tabs;
    for (let c = 0; c < CATEGORIES.length - 1; c++) {
      const share = Math.floor(remaining * (0.05 + r() * 0.2));
      byCategory[CATEGORIES[c] as string] = share;
      remaining -= share;
    }
    byCategory[CATEGORIES[CATEGORIES.length - 1] as string] = Math.max(0, remaining);

    rows.push({
      day: `${date.getUTCFullYear()}-${mm}-${dd}`,
      tabs,
      score: Math.max(4, Math.min(97, Math.round(28 + (tabs / 12) + (r() - 0.5) * 6))),
      closed,
      cleanups: cleanedUp ? 1 + Math.floor(r() * 2) : 0,
      byCategory,
    });

    // Going backwards: yesterday had fewer tabs on a normal day, more on a day we cleaned.
    tabs = Math.max(12, tabs + closed - Math.floor(r() * 9));
  }

  return rows.reverse();
}
