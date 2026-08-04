import { describe, it, expect } from 'vitest';
import { computeScore, scoreState, emptyScore, THRESHOLDS } from './score';
import { CAPS, TOTAL_CAP, countFactor, duplicateFactor, sprawlFactor, concentrationFactor, neverOpenedFactor, stalenessFactor } from './factors';
import type { DebtInput, TabSnapshot } from '@/types/tab';
import { generateFixture } from '@/test/fixtures/generate';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 6, 15, 12, 0, 0);

let seq = 0;
const t = (over: Partial<TabSnapshot> = {}): TabSnapshot => ({
  id: ++seq, url: `https://site${seq}.com/p`, title: `Tab ${seq}`, domain: `site${seq}.com`,
  windowId: 1, index: 0, groupId: -1, pinned: false, audible: false, muted: false,
  discarded: false, active: false, lastActiveAt: NOW, lastActiveInferred: false, createdAt: 0,
  ...over,
});

const input = (tabs: TabSnapshot[], over: Partial<DebtInput> = {}): DebtInput => ({
  tabs, windowCount: 1, now: NOW, baseline: 25, ...over,
});

describe('computeScore — purity and shape', () => {
  it('is a pure function of the snapshot', () => {
    const snap = input([t(), t(), t()]);
    expect(computeScore(snap)).toEqual(computeScore(snap));
  });

  it('always returns a value in 0-100', () => {
    for (const size of [0, 1, 25, 100, 400, 800]) {
      const tabs = Array.from({ length: size }, () => t({ lastActiveAt: NOW - 90 * DAY }));
      const s = computeScore(input(tabs, { windowCount: 9 }));
      expect(s.value).toBeGreaterThanOrEqual(0);
      expect(s.value).toBeLessThanOrEqual(100);
    }
  });

  it('sorts factors by contribution, biggest first', () => {
    const f = generateFixture(400);
    const tabs = f.tabs.map((x) => t({ id: x.id, url: x.url, domain: 'github.com', lastActiveAt: NOW - 40 * DAY }));
    const s = computeScore(input(tabs, { windowCount: 4 }));
    const points = s.factors.map((x) => x.points);
    expect([...points].sort((a, b) => b - a)).toEqual(points);
  });

  it('accounts for every point: factor caps sum to exactly 100', () => {
    expect(TOTAL_CAP).toBe(100);
    expect(Object.values(CAPS).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('never lets one factor saturate the score on its own', () => {
    // Nothing but duplicates: 40 copies of one URL, all fresh, one window.
    const tabs = Array.from({ length: 40 }, () =>
      t({ url: 'https://x.com/a', domain: 'x.com', lastActiveAt: NOW }),
    );
    const s = computeScore(input(tabs, { baseline: 100 }));
    const dup = s.factors.find((x) => x.id === 'duplicates')!;
    expect(dup.points).toBe(CAPS.duplicates);
    // capped contribution, so the total cannot reach red on duplicates alone
    expect(s.value).toBeLessThan(THRESHOLDS.warn);
  });
});

describe('computeScore — boundaries', () => {
  it('scores an empty browser at zero', () => {
    expect(computeScore(input([])).value).toBe(0);
    expect(emptyScore().value).toBe(0);
  });

  it('scores a healthy set at or under the baseline as green', () => {
    const tabs = Array.from({ length: 20 }, (_, i) =>
      t({ domain: `d${i}.com`, url: `https://d${i}.com/`, lastActiveAt: NOW - 60_000 }),
    );
    const s = computeScore(input(tabs));
    expect(s.value).toBeLessThanOrEqual(THRESHOLDS.good);
    expect(s.state).toBe('good');
  });

  it('scores a pathological set as red', () => {
    const tabs = Array.from({ length: 800 }, (_, i) =>
      t({
        url: i % 3 === 0 ? 'https://github.com/a/b' : `https://github.com/r/${i}`,
        domain: 'github.com',
        windowId: (i % 8) + 1,
        lastActiveAt: i % 4 === 0 ? null : NOW - 120 * DAY,
      }),
    );
    const s = computeScore(input(tabs, { windowCount: 8 }));
    expect(s.value).toBeGreaterThan(THRESHOLDS.warn);
    expect(s.state).toBe('bad');
  });

  it.each([
    [0, 'good'], [33, 'good'], [34, 'warn'], [66, 'warn'], [67, 'bad'], [100, 'bad'],
  ] as const)('maps %i to %s', (value, state) => {
    expect(scoreState(value)).toBe(state);
  });
});

describe('factors — individual behaviour', () => {
  it('count: zero at baseline, full cap at 8x baseline', () => {
    expect(countFactor(input(Array.from({ length: 25 }, () => t())))).toMatchObject({ points: 0 });
    expect(countFactor(input(Array.from({ length: 10 }, () => t())))).toMatchObject({ points: 0 });
    expect(countFactor(input(Array.from({ length: 200 }, () => t()))).points).toBe(CAPS.count);
    expect(countFactor(input(Array.from({ length: 800 }, () => t()))).points).toBe(CAPS.count);
  });

  it('count: rises monotonically between baseline and cap', () => {
    const at = (n: number): number => countFactor(input(Array.from({ length: n }, () => t()))).points;
    expect(at(50)).toBeGreaterThan(at(30));
    expect(at(100)).toBeGreaterThan(at(50));
  });

  it('duplicates: zero when all URLs are distinct', () => {
    const f = duplicateFactor(input([t(), t(), t()]));
    expect(f.points).toBe(0);
    expect(f.detail).toBe('No duplicate tabs found.');
    expect(f.tabIds).toEqual([]);
  });

  it('duplicates: names the count and exposes the tabs its remedy would close', () => {
    const tabs = [t({ url: 'https://x.com/a', domain: 'x.com' }), t({ url: 'https://x.com/a', domain: 'x.com' })];
    const f = duplicateFactor(input(tabs));
    expect(f.points).toBeGreaterThan(0);
    expect(f.tabIds).toHaveLength(1);
    expect(f.detail).toContain('1 redundant tab');
  });

  it('staleness: zero for a fresh set, capped for a uniformly ancient one', () => {
    expect(stalenessFactor(input([t(), t()])).points).toBe(0);
    const old = Array.from({ length: 10 }, () => t({ lastActiveAt: NOW - 200 * DAY }));
    expect(stalenessFactor(input(old)).points).toBe(CAPS.staleness);
  });

  it('neverOpened: counts only null lastActiveAt, not merely old tabs', () => {
    const old = Array.from({ length: 10 }, () => t({ lastActiveAt: NOW - 200 * DAY }));
    expect(neverOpenedFactor(input(old)).points).toBe(0);
    const never = Array.from({ length: 10 }, () => t({ lastActiveAt: null }));
    expect(neverOpenedFactor(input(never)).points).toBe(CAPS.neverOpened);
  });

  it('concentration: ignores a spread set, flags a pileup', () => {
    const spread = Array.from({ length: 20 }, (_, i) => t({ domain: `d${i}.com` }));
    expect(concentrationFactor(input(spread)).points).toBe(0);
    const piled = Array.from({ length: 20 }, () => t({ domain: 'github.com' }));
    const f = concentrationFactor(input(piled));
    expect(f.points).toBe(CAPS.concentration);
    expect(f.detail).toContain('github.com');
  });

  it('sprawl: zero for one window, capped at six', () => {
    expect(sprawlFactor(input([t()], { windowCount: 1 })).points).toBe(0);
    const many = Array.from({ length: 60 }, (_, i) => t({ windowId: (i % 6) + 1 }));
    expect(sprawlFactor(input(many, { windowCount: 6 })).points).toBe(CAPS.sprawl);
  });

  it('every factor exposes tabs its remedy can act on when it has points', () => {
    const f = generateFixture(400);
    const tabs = f.tabs.map((x) =>
      t({ id: x.id, url: x.url, domain: 'github.com', windowId: x.windowId, lastActiveAt: NOW - 40 * DAY }),
    );
    const s = computeScore(input(tabs, { windowCount: 4 }));
    for (const factor of s.factors) {
      if (factor.points > 0) {
        expect(factor.tabIds.length, `${factor.id} scored but has no remedy target`).toBeGreaterThan(0);
      }
      expect(factor.points).toBeLessThanOrEqual(factor.cap);
      expect(factor.detail.length).toBeGreaterThan(0);
    }
  });
});

describe('computeScore — moves when the user acts', () => {
  it('falls after duplicates are removed', () => {
    const dupes = Array.from({ length: 30 }, () => t({ url: 'https://x.com/a', domain: 'x.com' }));
    const before = computeScore(input(dupes));
    const after = computeScore(input(dupes.slice(0, 1)));
    expect(after.value).toBeLessThan(before.value);
  });

  it('falls after stale tabs are closed', () => {
    const stale = Array.from({ length: 100 }, (_, i) => t({ domain: `d${i}.com`, lastActiveAt: NOW - 90 * DAY }));
    const before = computeScore(input(stale));
    const after = computeScore(input(stale.slice(0, 20)));
    expect(after.value).toBeLessThan(before.value);
  });
});
