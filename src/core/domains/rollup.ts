import type { TabSnapshot } from '@/types/tab';
import type { Category } from '@/types/tab';
import { summarise, type StalenessSummary } from '../staleness/buckets';
import { estimateTotalMb, DEFAULT_WEIGHTS, type MemoryWeights } from '../memory/estimate';

/**
 * Per-domain rollup for the collapsible domain view.
 *
 * Pure aggregation over a tab list, so it composes with filters: rolling up the *filtered*
 * set is how "GitHub tabs I haven't touched in a month" becomes a single actionable row.
 */

export type DomainRow = {
  domain: string;
  tabs: TabSnapshot[];
  count: number;
  staleness: StalenessSummary;
  /** Tabs untouched for a week or more, plus never-opened. The actionable subset. */
  staleCount: number;
  neverOpened: number;
  estimatedMb: number;
  /** Most common category among these tabs — a domain is usually but not always one thing. */
  category: Category;
  oldestAge: number | null;
};

export type RollupOptions = {
  now: number;
  categoryOf: (tab: TabSnapshot) => Category;
  weights?: MemoryWeights;
  /** Domains with fewer tabs than this are folded into a single "Everything else" row. */
  minCount?: number;
};

const DAY = 86_400_000;

/** Internal pages have no domain; they are grouped under a readable label instead of "". */
export const NO_DOMAIN_LABEL = 'Browser pages';

function dominantCategory(tabs: TabSnapshot[], categoryOf: (t: TabSnapshot) => Category): Category {
  const counts = new Map<Category, number>();
  for (const t of tabs) {
    const c = categoryOf(t);
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  let best: Category = 'Other';
  let bestCount = -1;
  // Sorted so a tie resolves the same way every render rather than by Map insertion order.
  for (const [category, n] of [...counts].sort((a, b) =>
    b[1] === a[1] ? a[0].localeCompare(b[0]) : b[1] - a[1],
  )) {
    if (n > bestCount) {
      best = category;
      bestCount = n;
    }
  }
  return best;
}

export function rollupByDomain(tabs: TabSnapshot[], opts: RollupOptions): DomainRow[] {
  const weights = opts.weights ?? DEFAULT_WEIGHTS;
  const groups = new Map<string, TabSnapshot[]>();

  for (const tab of tabs) {
    const key = tab.domain || NO_DOMAIN_LABEL;
    const list = groups.get(key);
    if (list) list.push(tab);
    else groups.set(key, [tab]);
  }

  const rows: DomainRow[] = [];
  for (const [domain, list] of groups) {
    const staleness = summarise(list, opts.now);
    rows.push({
      domain,
      tabs: list,
      count: list.length,
      staleness,
      staleCount: list.filter(
        (t) => t.lastActiveAt === null || opts.now - t.lastActiveAt >= 7 * DAY,
      ).length,
      neverOpened: staleness.neverOpened,
      estimatedMb: estimateTotalMb(list, weights),
      category: dominantCategory(list, opts.categoryOf),
      oldestAge: staleness.oldestAge,
    });
  }

  // Biggest pile first: the domain worth acting on is the one with the most tabs.
  // Ties break on name so the order is stable between renders.
  return rows.sort((a, b) => b.count - a.count || a.domain.localeCompare(b.domain));
}

/**
 * A long tail of one-tab domains is noise in a view whose job is to surface piles.
 * Domains under `minCount` collapse into a single row the user can still expand and act on.
 */
export function foldSmallDomains(rows: DomainRow[], minCount: number, opts: RollupOptions): {
  rows: DomainRow[];
  folded: DomainRow | null;
} {
  if (minCount <= 1) return { rows, folded: null };
  const big = rows.filter((r) => r.count >= minCount);
  const small = rows.filter((r) => r.count < minCount);
  if (small.length === 0) return { rows: big, folded: null };

  const tabs = small.flatMap((r) => r.tabs);
  const staleness = summarise(tabs, opts.now);
  const folded: DomainRow = {
    domain: `${small.length} sites with under ${minCount} tabs`,
    tabs,
    count: tabs.length,
    staleness,
    staleCount: tabs.filter((t) => t.lastActiveAt === null || opts.now - t.lastActiveAt >= 7 * DAY)
      .length,
    neverOpened: staleness.neverOpened,
    estimatedMb: estimateTotalMb(tabs, opts.weights ?? DEFAULT_WEIGHTS),
    category: dominantCategory(tabs, opts.categoryOf),
    oldestAge: staleness.oldestAge,
  };
  return { rows: big, folded };
}

/** One-line summary for a collapsed row. Diagnostic, never scolding. */
export function describeDomain(row: DomainRow): string {
  const parts: string[] = [`${row.count} ${row.count === 1 ? 'tab' : 'tabs'}`];
  if (row.staleCount > 0) parts.push(`${row.staleCount} untouched for a week or more`);
  if (row.neverOpened > 0) parts.push(`${row.neverOpened} never opened`);
  return parts.join(', ');
}
