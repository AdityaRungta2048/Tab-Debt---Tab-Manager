import type { Category, TabSnapshot } from '@/types/tab';
import { bucketFor } from '../staleness/buckets';

/**
 * Composable filters. Pure: predicates over plain data, no Chrome, no state.
 *
 * Composition rule, chosen deliberately: quick filters AND together, while multiple
 * selections *within* one dimension OR together. "Stale + Pinned" means stale AND pinned —
 * narrowing, which is what a filter is for. But picking two categories means either of
 * them, because a tab cannot be two categories at once and ANDing there would always
 * return nothing.
 */

export const QUICK_FILTERS = [
  'today',
  'week',
  'stale',
  'never',
  'duplicates',
  'pinned',
  'audible',
  'muted',
  'discarded',
] as const;

export type QuickFilter = (typeof QUICK_FILTERS)[number];

export const QUICK_LABELS: Record<QuickFilter, string> = {
  today: 'Today',
  week: 'This week',
  stale: 'Stale',
  never: 'Never opened',
  duplicates: 'Duplicates',
  pinned: 'Pinned',
  audible: 'Audible',
  muted: 'Muted',
  discarded: 'Asleep',
};

export type FilterState = {
  quick: QuickFilter[];
  categories: Category[];
  windows: number[];
  domains: string[];
};

export const EMPTY_FILTERS: FilterState = { quick: [], categories: [], windows: [], domains: [] };

export type FilterContext = {
  now: number;
  /** Tab ids that a duplicate cluster proposes closing. Computed once by the caller. */
  duplicateIds: ReadonlySet<number>;
  categoryOf: (tab: TabSnapshot) => Category;
};

const DAY = 86_400_000;

function matchesQuick(tab: TabSnapshot, filter: QuickFilter, ctx: FilterContext): boolean {
  switch (filter) {
    case 'today':
      return bucketFor(tab, ctx.now) === 'today';
    case 'week':
      // "This week" is the last 7 days, so it deliberately includes today and yesterday
      // rather than being a bucket — a user filtering by week wants the whole week.
      return tab.lastActiveAt !== null && ctx.now - tab.lastActiveAt < 7 * DAY;
    case 'stale':
      return tab.lastActiveAt === null || ctx.now - tab.lastActiveAt >= 7 * DAY;
    case 'never':
      return tab.lastActiveAt === null;
    case 'duplicates':
      return ctx.duplicateIds.has(tab.id);
    case 'pinned':
      return tab.pinned;
    case 'audible':
      return tab.audible;
    case 'muted':
      return tab.muted;
    case 'discarded':
      return tab.discarded;
  }
}

export function matches(tab: TabSnapshot, state: FilterState, ctx: FilterContext): boolean {
  for (const q of state.quick) {
    if (!matchesQuick(tab, q, ctx)) return false;
  }
  if (state.categories.length > 0 && !state.categories.includes(ctx.categoryOf(tab))) return false;
  if (state.windows.length > 0 && !state.windows.includes(tab.windowId)) return false;
  if (state.domains.length > 0 && !state.domains.includes(tab.domain)) return false;
  return true;
}

export function applyFilters(
  tabs: TabSnapshot[],
  state: FilterState,
  ctx: FilterContext,
): TabSnapshot[] {
  if (isEmpty(state)) return tabs;
  return tabs.filter((t) => matches(t, state, ctx));
}

export function isEmpty(state: FilterState): boolean {
  return (
    state.quick.length === 0 &&
    state.categories.length === 0 &&
    state.windows.length === 0 &&
    state.domains.length === 0
  );
}

export function countActive(state: FilterState): number {
  return state.quick.length + state.categories.length + state.windows.length + state.domains.length;
}

/** One chip per active filter, so the bar can show and individually remove each. */
export type ActiveChip = {
  key: string;
  label: string;
  dimension: keyof FilterState;
  value: string | number;
};

export function activeChips(state: FilterState): ActiveChip[] {
  return [
    ...state.quick.map((q) => ({
      key: `quick:${q}`,
      label: QUICK_LABELS[q],
      dimension: 'quick' as const,
      value: q,
    })),
    ...state.categories.map((c) => ({
      key: `category:${c}`,
      label: c === 'Other' ? 'Uncategorised' : c,
      dimension: 'categories' as const,
      value: c,
    })),
    ...state.windows.map((w, i) => ({
      key: `window:${w}`,
      label: `Window ${i + 1}`,
      dimension: 'windows' as const,
      value: w,
    })),
    ...state.domains.map((d) => ({
      key: `domain:${d}`,
      label: d,
      dimension: 'domains' as const,
      value: d,
    })),
  ];
}

/** Immutable toggle. Returns a new state so callers cannot mutate shared filter state. */
export function toggle<K extends keyof FilterState>(
  state: FilterState,
  dimension: K,
  value: FilterState[K][number],
): FilterState {
  const current = state[dimension] as FilterState[K][number][];
  const next = current.includes(value)
    ? current.filter((v) => v !== value)
    : [...current, value];
  return { ...state, [dimension]: next };
}

export function clearAll(): FilterState {
  return { ...EMPTY_FILTERS };
}
