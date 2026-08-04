import { describe, it, expect } from 'vitest';
import {
  applyFilters,
  matches,
  isEmpty,
  countActive,
  activeChips,
  toggle,
  clearAll,
  EMPTY_FILTERS,
  QUICK_FILTERS,
  QUICK_LABELS,
  type FilterContext,
  type FilterState,
} from './filters';
import type { Category, TabSnapshot } from '@/types/tab';
import { classify } from '../categorize/classify';
import { findDuplicates } from '../duplicates/cluster';
import { fixtureSnapshots } from '@/test/fixtures/snapshot';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 6, 15, 12, 0, 0);

let seq = 0;
const t = (over: Partial<TabSnapshot> = {}): TabSnapshot => ({
  id: ++seq, url: `https://site${seq}.com/p`, title: `Tab ${seq}`, domain: `site${seq}.com`,
  windowId: 1, index: 0, groupId: -1, pinned: false, audible: false, muted: false,
  discarded: false, active: false, lastActiveAt: NOW, lastActiveInferred: false, createdAt: 0,
  ...over,
});

const ctx = (over: Partial<FilterContext> = {}): FilterContext => ({
  now: NOW,
  duplicateIds: new Set<number>(),
  categoryOf: () => 'Other' as Category,
  ...over,
});

const state = (over: Partial<FilterState> = {}): FilterState => ({ ...EMPTY_FILTERS, ...over });

describe('quick filters', () => {
  it.each([
    ['today', t({ lastActiveAt: NOW - 60_000 }), true],
    ['today', t({ lastActiveAt: NOW - 2 * DAY }), false],
    ['today', t({ lastActiveAt: null }), false],
    ['week', t({ lastActiveAt: NOW - 3 * DAY }), true],
    ['week', t({ lastActiveAt: NOW - 8 * DAY }), false],
    ['week', t({ lastActiveAt: null }), false],
    ['stale', t({ lastActiveAt: NOW - 8 * DAY }), true],
    ['stale', t({ lastActiveAt: NOW - 3 * DAY }), false],
    ['stale', t({ lastActiveAt: null }), true],
    ['never', t({ lastActiveAt: null }), true],
    ['never', t({ lastActiveAt: NOW - 90 * DAY }), false],
    ['pinned', t({ pinned: true }), true],
    ['pinned', t({ pinned: false }), false],
    ['audible', t({ audible: true }), true],
    ['muted', t({ muted: true }), true],
    ['discarded', t({ discarded: true }), true],
  ] as const)('%s matches correctly', (filter, tab, expected) => {
    expect(matches(tab, state({ quick: [filter] }), ctx())).toBe(expected);
  });

  it('week includes today, because a week filter means the whole week', () => {
    expect(matches(t({ lastActiveAt: NOW }), state({ quick: ['week'] }), ctx())).toBe(true);
  });

  it('stale and never are consistent: a never-opened tab is stale', () => {
    const tab = t({ lastActiveAt: null });
    expect(matches(tab, state({ quick: ['stale'] }), ctx())).toBe(true);
    expect(matches(tab, state({ quick: ['never'] }), ctx())).toBe(true);
  });

  it('duplicates uses the caller-supplied set', () => {
    const tab = t();
    const c = ctx({ duplicateIds: new Set([tab.id]) });
    expect(matches(tab, state({ quick: ['duplicates'] }), c)).toBe(true);
    expect(matches(t(), state({ quick: ['duplicates'] }), c)).toBe(false);
  });

  it('every quick filter has a label', () => {
    for (const q of QUICK_FILTERS) {
      expect(QUICK_LABELS[q], `${q} has no label`).toBeTruthy();
    }
  });
});

describe('composition', () => {
  it('ANDs quick filters together, narrowing the set', () => {
    const stalePinned = t({ lastActiveAt: NOW - 30 * DAY, pinned: true });
    const staleOnly = t({ lastActiveAt: NOW - 30 * DAY });
    const pinnedOnly = t({ pinned: true });
    const both = state({ quick: ['stale', 'pinned'] });

    expect(matches(stalePinned, both, ctx())).toBe(true);
    expect(matches(staleOnly, both, ctx())).toBe(false);
    expect(matches(pinnedOnly, both, ctx())).toBe(false);
  });

  it('ORs within a dimension, because a tab cannot be two categories at once', () => {
    const categoryOf = (tab: TabSnapshot): Category =>
      tab.domain === 'a.com' ? 'Development' : 'Shopping';
    const c = ctx({ categoryOf });
    const dev = t({ domain: 'a.com' });
    const shop = t({ domain: 'b.com' });
    const s = state({ categories: ['Development', 'Shopping'] });

    expect(matches(dev, s, c)).toBe(true);
    expect(matches(shop, s, c)).toBe(true);
    // ANDing here would match nothing at all, which is why the rule differs by dimension.
    expect(applyFilters([dev, shop], s, c)).toHaveLength(2);
  });

  it('ANDs across dimensions', () => {
    const categoryOf = (): Category => 'Development';
    const c = ctx({ categoryOf });
    const match = t({ windowId: 2, pinned: true });
    const wrongWindow = t({ windowId: 3, pinned: true });
    const notPinned = t({ windowId: 2 });
    const s = state({ quick: ['pinned'], categories: ['Development'], windows: [2] });

    expect(matches(match, s, c)).toBe(true);
    expect(matches(wrongWindow, s, c)).toBe(false);
    expect(matches(notPinned, s, c)).toBe(false);
  });

  it('filters by domain', () => {
    const a = t({ domain: 'github.com' });
    const b = t({ domain: 'youtube.com' });
    expect(applyFilters([a, b], state({ domains: ['github.com'] }), ctx())).toEqual([a]);
  });

  it('an empty filter state returns the input untouched, not a copy-filtered clone', () => {
    const tabs = [t(), t(), t()];
    expect(applyFilters(tabs, EMPTY_FILTERS, ctx())).toBe(tabs);
  });

  it('an impossible combination returns nothing rather than throwing', () => {
    const tab = t({ pinned: true, audible: false });
    expect(applyFilters([tab], state({ quick: ['pinned', 'audible'] }), ctx())).toEqual([]);
  });
});

describe('filter state helpers', () => {
  it('reports emptiness and active count', () => {
    expect(isEmpty(EMPTY_FILTERS)).toBe(true);
    expect(countActive(EMPTY_FILTERS)).toBe(0);
    const s = state({ quick: ['stale'], categories: ['Work'], windows: [1], domains: ['x.com'] });
    expect(isEmpty(s)).toBe(false);
    expect(countActive(s)).toBe(4);
  });

  it('toggle adds, removes, and never mutates the input', () => {
    const original = state({ quick: ['stale'] });
    const added = toggle(original, 'quick', 'pinned');
    expect(added.quick).toEqual(['stale', 'pinned']);
    expect(original.quick).toEqual(['stale']);

    const removed = toggle(added, 'quick', 'stale');
    expect(removed.quick).toEqual(['pinned']);
    expect(added.quick).toEqual(['stale', 'pinned']);
  });

  it('clearAll returns an empty state', () => {
    expect(isEmpty(clearAll())).toBe(true);
  });

  it('produces one chip per active filter, each individually removable', () => {
    const s = state({
      quick: ['stale', 'pinned'],
      categories: ['Development', 'Other'],
      windows: [100, 101],
      domains: ['github.com'],
    });
    const chips = activeChips(s);
    expect(chips).toHaveLength(countActive(s));
    expect(new Set(chips.map((c) => c.key)).size).toBe(chips.length);
    expect(chips.map((c) => c.label)).toContain('Stale');
    // "Other" is an internal bucket name; the chip must not leak it to a person.
    expect(chips.map((c) => c.label)).toContain('Uncategorised');
    // Windows get 1-based human numbering, not raw Chrome window ids.
    expect(chips.map((c) => c.label)).toContain('Window 1');
    expect(chips.map((c) => c.label)).toContain('Window 2');

    // Every chip round-trips: toggling its value off removes exactly that chip.
    for (const chip of chips) {
      const next = toggle(s, chip.dimension, chip.value as never);
      expect(countActive(next)).toBe(countActive(s) - 1);
    }
  });
});

describe('against the 800-tab fixture', () => {
  const { tabs, fixture } = fixtureSnapshots(800);
  const categoryOf = (tab: TabSnapshot): Category =>
    classify({ url: tab.url, title: tab.title }).category;
  const duplicateIds = new Set(
    findDuplicates(tabs).flatMap((c) => c.close.map((x) => x.id)),
  );
  const c = ctx({ now: fixture.now, duplicateIds, categoryOf });

  it('every quick filter returns a strict, non-empty subset', () => {
    for (const q of QUICK_FILTERS) {
      const out = applyFilters(tabs, state({ quick: [q] }), c);
      expect(out.length, `${q} matched nothing`).toBeGreaterThan(0);
      expect(out.length, `${q} matched everything`).toBeLessThan(tabs.length);
    }
  });

  it('composing two filters never returns more than either alone', () => {
    for (const a of QUICK_FILTERS) {
      for (const b of QUICK_FILTERS) {
        if (a === b) continue;
        const both = applyFilters(tabs, state({ quick: [a, b] }), c).length;
        const justA = applyFilters(tabs, state({ quick: [a] }), c).length;
        const justB = applyFilters(tabs, state({ quick: [b] }), c).length;
        expect(both).toBeLessThanOrEqual(Math.min(justA, justB));
      }
    }
  });

  it('stale and today partition the tabs that have ever been active', () => {
    const stale = applyFilters(tabs, state({ quick: ['stale'] }), c);
    const today = applyFilters(tabs, state({ quick: ['today'] }), c);
    const overlap = stale.filter((x) => today.includes(x));
    expect(overlap).toEqual([]);
  });

  it('filtering by every window returns every tab', () => {
    const windows = [...new Set(tabs.map((x) => x.windowId))];
    expect(applyFilters(tabs, state({ windows }), c)).toHaveLength(tabs.length);
  });
});
