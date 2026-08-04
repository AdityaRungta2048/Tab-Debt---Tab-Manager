import { describe, it, expect } from 'vitest';
import { rollupByDomain, foldSmallDomains, describeDomain, NO_DOMAIN_LABEL } from './rollup';
import type { Category, TabSnapshot } from '@/types/tab';
import { classify } from '../categorize/classify';
import { fixtureSnapshots } from '@/test/fixtures/snapshot';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 6, 15, 12, 0, 0);

let seq = 0;
const t = (over: Partial<TabSnapshot> = {}): TabSnapshot => ({
  id: ++seq, url: 'https://x.com/p', title: `Tab ${seq}`, domain: 'x.com', windowId: 1,
  index: 0, groupId: -1, pinned: false, audible: false, muted: false, discarded: false,
  active: false, lastActiveAt: NOW, lastActiveInferred: false, createdAt: 0, ...over,
});

const opts = (over: Partial<Parameters<typeof rollupByDomain>[1]> = {}) => ({
  now: NOW,
  categoryOf: (): Category => 'Other' as Category,
  ...over,
});

describe('rollupByDomain', () => {
  it('groups by domain and counts', () => {
    const rows = rollupByDomain(
      [t({ domain: 'a.com' }), t({ domain: 'a.com' }), t({ domain: 'b.com' })],
      opts(),
    );
    expect(rows.map((r) => [r.domain, r.count])).toEqual([
      ['a.com', 2],
      ['b.com', 1],
    ]);
  });

  it('sorts biggest pile first, ties by name, so the order is stable', () => {
    const tabs = [
      ...Array.from({ length: 3 }, () => t({ domain: 'zebra.com' })),
      ...Array.from({ length: 3 }, () => t({ domain: 'alpha.com' })),
      ...Array.from({ length: 9 }, () => t({ domain: 'mid.com' })),
    ];
    const rows = rollupByDomain(tabs, opts());
    expect(rows.map((r) => r.domain)).toEqual(['mid.com', 'alpha.com', 'zebra.com']);
    expect(rollupByDomain(tabs, opts()).map((r) => r.domain)).toEqual(rows.map((r) => r.domain));
  });

  it('gives internal pages a readable label instead of an empty domain', () => {
    const rows = rollupByDomain([t({ domain: '', url: 'chrome://settings/' })], opts());
    expect(rows[0]!.domain).toBe(NO_DOMAIN_LABEL);
  });

  it('counts stale and never-opened tabs per domain', () => {
    const rows = rollupByDomain(
      [
        t({ domain: 'a.com', lastActiveAt: NOW }),
        t({ domain: 'a.com', lastActiveAt: NOW - 30 * DAY }),
        t({ domain: 'a.com', lastActiveAt: null }),
      ],
      opts(),
    );
    const row = rows[0]!;
    expect(row.count).toBe(3);
    // Stale = a week or more untouched, plus never-opened.
    expect(row.staleCount).toBe(2);
    expect(row.neverOpened).toBe(1);
    expect(row.oldestAge).toBe(30 * DAY);
  });

  it('reports the dominant category, resolving ties deterministically', () => {
    const categoryOf = (tab: TabSnapshot): Category =>
      tab.title.startsWith('dev') ? 'Development' : 'Shopping';
    const rows = rollupByDomain(
      [
        t({ domain: 'a.com', title: 'dev 1' }),
        t({ domain: 'a.com', title: 'dev 2' }),
        t({ domain: 'a.com', title: 'shop' }),
      ],
      opts({ categoryOf }),
    );
    expect(rows[0]!.category).toBe('Development');
  });

  it('estimates size per domain and labels it as an estimate at the render layer', () => {
    const rows = rollupByDomain([t({ domain: 'a.com' }), t({ domain: 'a.com' })], opts());
    expect(rows[0]!.estimatedMb).toBeGreaterThan(0);
  });

  it('handles an empty list', () => {
    expect(rollupByDomain([], opts())).toEqual([]);
  });
});

describe('foldSmallDomains', () => {
  const tabs = [
    ...Array.from({ length: 10 }, () => t({ domain: 'big.com' })),
    ...Array.from({ length: 4 }, () => t({ domain: 'mid.com' })),
    t({ domain: 'one.com' }),
    t({ domain: 'two.com' }),
    t({ domain: 'three.com' }),
  ];

  it('folds the long tail into one row that still holds its tabs', () => {
    const rows = rollupByDomain(tabs, opts());
    const { rows: kept, folded } = foldSmallDomains(rows, 4, opts());
    expect(kept.map((r) => r.domain)).toEqual(['big.com', 'mid.com']);
    expect(folded).not.toBeNull();
    expect(folded!.count).toBe(3);
    expect(folded!.tabs).toHaveLength(3);
    expect(folded!.domain).toContain('3 sites');
  });

  it('loses no tabs while folding', () => {
    const rows = rollupByDomain(tabs, opts());
    const { rows: kept, folded } = foldSmallDomains(rows, 4, opts());
    const total = kept.reduce((n, r) => n + r.count, 0) + (folded?.count ?? 0);
    expect(total).toBe(tabs.length);
  });

  it('is a no-op when nothing is small enough to fold', () => {
    const rows = rollupByDomain(tabs, opts());
    const { rows: kept, folded } = foldSmallDomains(rows, 1, opts());
    expect(folded).toBeNull();
    expect(kept).toEqual(rows);
  });
});

describe('describeDomain', () => {
  it('states the count, and the actionable subsets when they exist', () => {
    const [row] = rollupByDomain(
      [
        t({ domain: 'a.com', lastActiveAt: NOW - 30 * DAY }),
        t({ domain: 'a.com', lastActiveAt: null }),
      ],
      opts(),
    );
    const text = describeDomain(row!);
    expect(text).toContain('2 tabs');
    expect(text).toContain('untouched');
    expect(text).toContain('never opened');
  });

  it('says nothing beyond the count when there is nothing to act on', () => {
    const [row] = rollupByDomain([t({ domain: 'a.com', lastActiveAt: NOW })], opts());
    expect(describeDomain(row!)).toBe('1 tab');
  });

  it('never scolds', () => {
    const rows = rollupByDomain(
      Array.from({ length: 40 }, () => t({ domain: 'a.com', lastActiveAt: null })),
      opts(),
    );
    const text = describeDomain(rows[0]!).toLowerCase();
    for (const word of ['too many', 'problem', 'wow', 'really', 'hoarding', 'should']) {
      expect(text).not.toContain(word);
    }
  });
});

describe('against the 800-tab fixture', () => {
  const { tabs, fixture } = fixtureSnapshots(800);
  const categoryOf = (tab: TabSnapshot): Category =>
    classify({ url: tab.url, title: tab.title }).category;

  it('accounts for every tab exactly once', () => {
    const rows = rollupByDomain(tabs, { now: fixture.now, categoryOf });
    expect(rows.reduce((n, r) => n + r.count, 0)).toBe(tabs.length);
    const ids = rows.flatMap((r) => r.tabs.map((x) => x.id));
    expect(new Set(ids).size).toBe(tabs.length);
  });

  it('surfaces a real pile at the top', () => {
    const rows = rollupByDomain(tabs, { now: fixture.now, categoryOf });
    expect(rows[0]!.count).toBeGreaterThan(20);
  });

  it('composes with a filtered subset rather than assuming the whole set', () => {
    const stale = tabs.filter((x) => x.lastActiveAt === null);
    const rows = rollupByDomain(stale, { now: fixture.now, categoryOf });
    expect(rows.reduce((n, r) => n + r.count, 0)).toBe(stale.length);
  });
});
