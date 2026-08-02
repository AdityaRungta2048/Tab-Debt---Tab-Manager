import type { DebtInput, TabSnapshot } from '@/types/tab';
import type { ScoreFactor } from '@/types/suggestion';
import { summarise } from '../staleness/buckets';
import { findDuplicates, duplicateStats } from '../duplicates/cluster';

/**
 * Factor caps. They sum to exactly 100, so the score is a real budget rather than a
 * normalised blend, and no single factor can saturate it — a user with zero duplicates
 * and 800 stale tabs must still be able to reach red, and a user with nothing but
 * duplicates must not.
 */
export const CAPS = {
  count: 30,
  duplicates: 20,
  staleness: 20,
  neverOpened: 10,
  concentration: 12,
  sprawl: 8,
} as const;

export const TOTAL_CAP = Object.values(CAPS).reduce((a, b) => a + b, 0);

const clamp01 = (n: number): number => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);
const round1 = (n: number): number => Math.round(n * 10) / 10;

/** Tabs sorted stalest-first. Used to pick which tabs a factor's remedy should target. */
function stalestFirst(tabs: TabSnapshot[]): TabSnapshot[] {
  return [...tabs].sort((a, b) => (a.lastActiveAt ?? -Infinity) - (b.lastActiveAt ?? -Infinity));
}

export function countFactor(input: DebtInput): ScoreFactor {
  const { tabs, baseline } = input;
  const ratio = tabs.length / Math.max(1, baseline);
  // Log curve: no debt at or under baseline, full cap at 8x baseline. Linear would make
  // 800 tabs and 8,000 tabs feel identical, and 30 tabs feel like a crisis.
  const load = ratio <= 1 ? 0 : clamp01(Math.log2(ratio) / Math.log2(8));
  const over = Math.max(0, tabs.length - baseline);
  return {
    id: 'count',
    label: 'Tab count',
    points: round1(load * CAPS.count),
    cap: CAPS.count,
    detail:
      over === 0
        ? `${tabs.length} tabs, at or under your comfortable baseline of ${baseline}.`
        : `${tabs.length} tabs open, ${over} above your baseline of ${baseline}.`,
    tabIds: stalestFirst(tabs).slice(0, over).map((t) => t.id),
  };
}

export function duplicateFactor(input: DebtInput, trackingParams?: string[]): ScoreFactor {
  const clusters = findDuplicates(input.tabs, trackingParams ? { trackingParams } : {});
  const stats = duplicateStats(clusters);
  const ratio = stats.closable / Math.max(1, input.tabs.length);
  // A quarter of the set being redundant is as bad as this factor gets.
  const load = clamp01(ratio / 0.25);
  return {
    id: 'duplicates',
    label: 'Duplicates',
    points: round1(load * CAPS.duplicates),
    cap: CAPS.duplicates,
    detail:
      stats.closable === 0
        ? 'No duplicate tabs found.'
        : `${stats.closable} redundant ${stats.closable === 1 ? 'tab' : 'tabs'} across ${stats.clusters} ${stats.clusters === 1 ? 'group' : 'groups'}.`,
    tabIds: clusters.flatMap((c) => c.close.map((t) => t.id)),
  };
}

export function stalenessFactor(input: DebtInput): ScoreFactor {
  const s = summarise(input.tabs, input.now);
  // Both horizons contribute equally: a set that is uniformly two weeks old and a set
  // that is uniformly two months old should not score the same.
  const load = clamp01(s.staleShare7d * 0.5 + s.staleShare30d * 0.5);
  const stale = input.tabs.filter(
    (t) => t.lastActiveAt !== null && input.now - t.lastActiveAt >= 7 * 86_400_000,
  );
  return {
    id: 'staleness',
    label: 'Stale tabs',
    points: round1(load * CAPS.staleness),
    cap: CAPS.staleness,
    detail:
      stale.length === 0
        ? 'Nothing has been sitting untouched for a week.'
        : `${stale.length} ${stale.length === 1 ? 'tab' : 'tabs'} untouched for over a week, ${s.counts['30days']} for over a month.`,
    tabIds: stalestFirst(stale).map((t) => t.id),
  };
}

export function neverOpenedFactor(input: DebtInput): ScoreFactor {
  const never = input.tabs.filter((t) => t.lastActiveAt === null);
  const load = clamp01(never.length / Math.max(1, input.tabs.length) / 0.3);
  return {
    id: 'neverOpened',
    label: 'Never opened',
    points: round1(load * CAPS.neverOpened),
    cap: CAPS.neverOpened,
    detail:
      never.length === 0
        ? 'Every open tab has been looked at.'
        : `${never.length} ${never.length === 1 ? 'tab was' : 'tabs were'} opened but never viewed.`,
    tabIds: never.map((t) => t.id),
  };
}

export function concentrationFactor(input: DebtInput): ScoreFactor {
  const byDomain = new Map<string, TabSnapshot[]>();
  for (const t of input.tabs) {
    if (!t.domain) continue;
    const list = byDomain.get(t.domain);
    if (list) list.push(t);
    else byDomain.set(t.domain, [t]);
  }
  let top: { domain: string; tabs: TabSnapshot[] } | null = null;
  for (const [domain, list] of byDomain) {
    if (!top || list.length > top.tabs.length) top = { domain, tabs: list };
  }
  const share = top ? top.tabs.length / Math.max(1, input.tabs.length) : 0;
  // Under 10% from one host is normal. 50% from one host is a pile, not a workflow.
  const load = clamp01((share - 0.1) / 0.4);
  return {
    id: 'concentration',
    label: 'Domain pileup',
    points: round1(load * CAPS.concentration),
    cap: CAPS.concentration,
    detail: top
      ? `${top.tabs.length} tabs from ${top.domain}, ${Math.round(share * 100)}% of everything open.`
      : 'No single site dominates.',
    tabIds: top ? stalestFirst(top.tabs).map((t) => t.id) : [],
  };
}

export function sprawlFactor(input: DebtInput): ScoreFactor {
  const windows = new Map<number, TabSnapshot[]>();
  for (const t of input.tabs) {
    const list = windows.get(t.windowId);
    if (list) list.push(t);
    else windows.set(t.windowId, [t]);
  }
  const count = Math.max(input.windowCount, windows.size);
  const load = clamp01((count - 1) / 5); // 6+ windows is full cap
  // The remedy targets the smallest windows: those are the ones worth consolidating.
  const smallest = [...windows.entries()].sort((a, b) => a[1].length - b[1].length).slice(0, -1);
  return {
    id: 'sprawl',
    label: 'Window sprawl',
    points: round1(load * CAPS.sprawl),
    cap: CAPS.sprawl,
    detail:
      count <= 1
        ? 'Everything is in one window.'
        : `Spread across ${count} windows, which makes anything hard to find.`,
    tabIds: smallest.flatMap(([, list]) => list.map((t) => t.id)),
  };
}
