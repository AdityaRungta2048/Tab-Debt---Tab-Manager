import { describe, it, expect } from 'vitest';
import { suggest, rankValue, totalRecoverable, MAX_SUGGESTIONS, MIN_AFFECTED } from './rank';
import { duplicateSuggestions, staleCategorySuggestions, neverWatchedSuggestions, windowSprawlSuggestions, domainPileupSuggestions } from './templates';
import { DEFAULT_WEIGHTS } from '../memory/estimate';
import { protectionReason } from '../duplicates/cluster';
import type { DebtInput, TabSnapshot } from '@/types/tab';
import { fixtureInput } from '@/test/fixtures/snapshot';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 6, 15, 12, 0, 0);

let seq = 0;
const t = (over: Partial<TabSnapshot> = {}): TabSnapshot => ({
  id: ++seq, url: `https://site${seq}.com/p`, title: `Tab ${seq}`, domain: `site${seq}.com`,
  windowId: 1, index: 0, groupId: -1, pinned: false, audible: false, muted: false,
  discarded: false, active: false, lastActiveAt: NOW - 30 * DAY, lastActiveInferred: false,
  createdAt: 0, ...over,
});
const input = (tabs: TabSnapshot[], over: Partial<DebtInput> = {}): DebtInput => ({
  tabs, windowCount: 1, now: NOW, baseline: 25, ...over,
});
const ctx = (i: DebtInput) => ({ input: i, overrides: {}, weights: DEFAULT_WEIGHTS, trackingParams: undefined });

describe('suggest — the acceptance gate', () => {
  it('top suggestion recovers at least 15% of a 400-tab fixture', () => {
    const i = fixtureInput(400);
    const list = suggest(i);
    expect(list.length).toBeGreaterThan(0);
    const share = (list[0]!.tabIds.length / i.tabs.length) * 100;
    expect(share, `top suggestion only recovers ${share.toFixed(1)}%`).toBeGreaterThanOrEqual(15);
  });

  it('holds at 800 tabs, where the leverage matters most', () => {
    const i = fixtureInput(800);
    const share = (suggest(i)[0]!.tabIds.length / i.tabs.length) * 100;
    expect(share, `800-tab fixture: ${share.toFixed(1)}%`).toBeGreaterThanOrEqual(15);
  });

  /**
   * The brief sets the 15% bar against the 400-tab fixture specifically. At 200 the
   * measured figure is ~13.5%: smaller sets have proportionally fewer random duplicate
   * collisions, so the top suggestion is genuinely smaller. Asserting the real number
   * beats tuning the fixture until the gate turns green. See DECISIONS.md D-007.
   */
  it('still finds a double-digit win on smaller sets', () => {
    for (const size of [50, 200]) {
      const i = fixtureInput(size);
      const share = (suggest(i)[0]!.tabIds.length / i.tabs.length) * 100;
      expect(share, `${size}-tab fixture: ${share.toFixed(1)}%`).toBeGreaterThanOrEqual(10);
    }
  });
});

describe('suggest — the rules the brief sets', () => {
  it('never shows more than 5', () => {
    expect(suggest(fixtureInput(800)).length).toBeLessThanOrEqual(MAX_SUGGESTIONS);
  });

  it('never shows a suggestion affecting fewer than 3 tabs', () => {
    for (const size of [50, 200, 400, 800]) {
      for (const s of suggest(fixtureInput(size))) {
        expect(s.tabIds.length).toBeGreaterThanOrEqual(MIN_AFFECTED);
      }
    }
  });

  it('ranks by tabs recovered × confidence', () => {
    const list = suggest(fixtureInput(400));
    const values = list.map(rankValue);
    for (let i = 1; i < values.length; i++) {
      expect(values[i - 1]!).toBeGreaterThanOrEqual(values[i]!);
    }
  });

  it('returns nothing for a small tidy browser rather than inventing work', () => {
    const tabs = Array.from({ length: 5 }, (_, i) => t({ domain: `d${i}.com`, lastActiveAt: NOW }));
    expect(suggest(input(tabs))).toEqual([]);
  });
});

describe('suggest — counts on screen must be counts that happen', () => {
  it('never lets two suggestions claim the same tab', () => {
    for (const size of [200, 400, 800]) {
      const list = suggest(fixtureInput(size));
      const all = list.flatMap((s) => s.tabIds);
      expect(new Set(all).size, `${size}-tab fixture double-counts a tab`).toBe(all.length);
    }
  });

  it('keeps the action target identical to the advertised tab list', () => {
    for (const s of suggest(fixtureInput(400))) {
      expect([...s.action.tabIds].sort()).toEqual([...s.tabIds].sort());
    }
  });

  it('keeps the headline number equal to the number of tabs affected', () => {
    for (const s of suggest(fixtureInput(400))) {
      const n = Number(s.headline.match(/\d+/)?.[0]);
      expect(n, `"${s.headline}" does not match ${s.tabIds.length} tabs`).toBe(s.tabIds.length);
    }
  });

  it('only claims recovered memory for actions that actually close tabs', () => {
    for (const s of suggest(fixtureInput(400))) {
      if (s.action.kind === 'group' || s.action.kind === 'pin' || s.action.kind === 'mute') {
        expect(s.estimatedMb, `${s.id} claims memory for a non-closing action`).toBe(0);
      }
    }
  });
});

describe('suggest — safety', () => {
  it('never auto-selects a protected tab', () => {
    const i = fixtureInput(400);
    const protectedIds = new Set(i.tabs.filter((x) => protectionReason(x)).map((x) => x.id));
    for (const s of suggest(i)) {
      for (const id of s.tabIds) {
        expect(protectedIds.has(id), `suggestion ${s.id} would touch a protected tab`).toBe(false);
      }
    }
  });

  it('bookmarks before closing when a sweep is large', () => {
    const tabs = Array.from({ length: 40 }, (_, i) =>
      t({ url: `https://github.com/r/${i}`, domain: 'github.com', lastActiveAt: NOW - 60 * DAY }),
    );
    const sweeps = staleCategorySuggestions(ctx(input(tabs)));
    expect(sweeps[0]!.action.kind).toBe('bookmarkAndClose');
    expect(sweeps[0]!.headline).toContain('Bookmark and close');
  });

  it('plainly closes a small sweep instead of over-ceremonial bookmarking', () => {
    const tabs = Array.from({ length: 5 }, (_, i) =>
      t({ url: `https://github.com/r/${i}`, domain: 'github.com', lastActiveAt: NOW - 60 * DAY }),
    );
    expect(staleCategorySuggestions(ctx(input(tabs)))[0]!.action.kind).toBe('close');
  });

  it('never turns the risky same-page duplicate tier into a one-click action', () => {
    const tabs = [
      t({ url: 'https://a.com/s?k=1', domain: 'a.com' }),
      t({ url: 'https://a.com/s?k=2', domain: 'a.com' }),
      t({ url: 'https://a.com/s?k=3', domain: 'a.com' }),
      t({ url: 'https://a.com/s?k=4', domain: 'a.com' }),
    ];
    expect(duplicateSuggestions(ctx(input(tabs)))).toEqual([]);
  });
});

describe('templates', () => {
  it('duplicates: fires on exact and canonical clusters', () => {
    const tabs = [
      t({ url: 'https://x.com/a', domain: 'x.com' }),
      t({ url: 'https://x.com/a', domain: 'x.com' }),
      t({ url: 'https://x.com/a?utm_source=z', domain: 'x.com' }),
      t({ url: 'https://x.com/a/', domain: 'x.com' }),
    ];
    const s = duplicateSuggestions(ctx(input(tabs)))[0]!;
    expect(s.tabIds.length).toBe(3);
    expect(s.confidence).toBeGreaterThan(0.9);
  });

  it('neverWatched: only null-lastActive video tabs, and never an audible one', () => {
    const tabs = [
      t({ domain: 'youtube.com', lastActiveAt: null }),
      t({ domain: 'youtube.com', lastActiveAt: null }),
      t({ domain: 'youtube.com', lastActiveAt: null }),
      t({ domain: 'youtube.com', lastActiveAt: null, audible: true }),
      t({ domain: 'youtube.com', lastActiveAt: NOW }),
    ];
    const s = neverWatchedSuggestions(ctx(input(tabs)))[0]!;
    expect(s.tabIds).toHaveLength(3);
    expect(s.detail).toContain('never played');
  });

  it('domainPileup: needs a real pile, and groups rather than closes', () => {
    const small = Array.from({ length: 4 }, () => t({ domain: 'github.com' }));
    expect(domainPileupSuggestions(ctx(input(small)))).toEqual([]);
    const pile = Array.from({ length: 12 }, () => t({ domain: 'github.com', lastActiveAt: NOW - 20 * DAY }));
    const s = domainPileupSuggestions(ctx(input(pile)))[0]!;
    expect(s.action.kind).toBe('group');
    expect(s.estimatedMb).toBe(0);
  });

  it('windowSprawl: silent below three windows', () => {
    const two = [t({ windowId: 1 }), t({ windowId: 2 }), t({ windowId: 2 })];
    expect(windowSprawlSuggestions(ctx(input(two, { windowCount: 2 })))).toEqual([]);
  });

  it('windowSprawl: proposes consolidating small stray windows', () => {
    const tabs = [
      ...Array.from({ length: 30 }, () => t({ windowId: 1 })),
      ...Array.from({ length: 3 }, () => t({ windowId: 2 })),
      ...Array.from({ length: 2 }, () => t({ windowId: 3 })),
    ];
    const s = windowSprawlSuggestions(ctx(input(tabs, { windowCount: 3 })))[0]!;
    expect(s.tabIds).toHaveLength(5);
    expect(s.action.kind).toBe('group');
  });
});

describe('totalRecoverable', () => {
  it('counts distinct tabs across the whole list', () => {
    const list = suggest(fixtureInput(400));
    expect(totalRecoverable(list)).toBe(new Set(list.flatMap((s) => s.tabIds)).size);
  });
});
