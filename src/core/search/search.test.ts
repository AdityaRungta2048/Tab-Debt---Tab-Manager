import { describe, it, expect } from 'vitest';
import { buildIndex, search, canReuse } from './search';
import { classify } from '../categorize/classify';
import { fixtureSnapshots } from '@/test/fixtures/snapshot';
import type { TabSnapshot } from '@/types/tab';

const categoryOf = (t: TabSnapshot) => classify({ url: t.url, title: t.title }).category;

let seq = 0;
const t = (title: string, url: string): TabSnapshot => ({
  id: ++seq, url, title, domain: new URL(url).hostname.replace(/^www\./, ''), windowId: 1,
  index: 0, groupId: -1, pinned: false, audible: false, muted: false, discarded: false,
  active: false, lastActiveAt: 0, lastActiveInferred: false, createdAt: 0,
});

describe('search — behaviour', () => {
  const tabs = [
    t('vitejs/vite: Next generation tooling', 'https://github.com/vitejs/vite'),
    t('Inbox (2,481)', 'https://mail.google.com/mail/u/0/'),
    t('Loft in Lisbon', 'https://www.airbnb.com/rooms/1'),
    t('Rust Ownership Explained', 'https://www.youtube.com/watch?v=abc'),
  ];
  const index = buildIndex(tabs, categoryOf);

  it('returns everything for an empty query', () => {
    expect(search(index, '')).toHaveLength(4);
    expect(search(index, '   ')).toHaveLength(4);
  });

  it('matches on title, url, domain and category alike', () => {
    expect(search(index, 'lisbon').map((r) => r.id)).toEqual([tabs[2]!.id]);
    expect(search(index, 'rooms').map((r) => r.id)).toEqual([tabs[2]!.id]);
    expect(search(index, 'github.com').map((r) => r.id)).toEqual([tabs[0]!.id]);
    // "Travel" is airbnb's category, present in no title or URL
    expect(search(index, 'travel').map((r) => r.id)).toEqual([tabs[2]!.id]);
  });

  it('is case-insensitive', () => {
    expect(search(index, 'LISBON')).toHaveLength(1);
  });

  it('ANDs multiple tokens', () => {
    expect(search(index, 'rust explained')).toHaveLength(1);
    expect(search(index, 'rust lisbon')).toHaveLength(0);
  });

  it('supports fuzzy subsequence matching', () => {
    expect(search(index, 'gthb').map((r) => r.id)).toContain(tabs[0]!.id);
  });

  it('ranks an exact domain hit above an incidental mention', () => {
    const extra = [...tabs, t('A post about github', 'https://blog.example/github-post')];
    const idx = buildIndex(extra, categoryOf);
    const results = search(idx, 'github.com');
    expect(results[0]!.id).toBe(tabs[0]!.id);
  });

  it('is deterministic: identical queries give identical order', () => {
    expect(search(index, 'e')).toEqual(search(index, 'e'));
  });

  it('returns nothing for a query that matches nothing', () => {
    expect(search(index, 'zzzzzzqqqq')).toEqual([]);
  });
});

describe('search — incremental reuse', () => {
  const { tabs } = fixtureSnapshots(800);
  const index = buildIndex(tabs, categoryOf);

  it('knows when the previous results can be reused', () => {
    expect(canReuse('git', 'gith')).toBe(true);
    expect(canReuse('git', 'git')).toBe(true);
    expect(canReuse('git', 'ru')).toBe(false);
    expect(canReuse('', 'g')).toBe(false);
  });

  it('gives the same answer whether or not the previous results are reused', () => {
    const first = search(index, 'git');
    const fromScratch = search(index, 'gith');
    const incremental = search(index, 'gith', first);
    expect(incremental).toEqual(fromScratch);
  });
});

/** The brief's budget: under 16ms per keystroke at 800 tabs. Measured, not assumed. */
describe('search — performance at 800 tabs', () => {
  const { tabs } = fixtureSnapshots(800);
  expect(tabs.length).toBeGreaterThanOrEqual(800);

  it('builds the index once in reasonable time', () => {
    const start = performance.now();
    buildIndex(tabs, categoryOf);
    const elapsed = performance.now() - start;
    expect(elapsed, `index build took ${elapsed.toFixed(1)}ms`).toBeLessThan(250);
  });

  it('answers every keystroke of a realistic query under 16ms', () => {
    const index = buildIndex(tabs, categoryOf);
    const query = 'github pull request';
    let previous: ReturnType<typeof search> | undefined;
    let prevQuery = '';
    const timings: number[] = [];

    for (let i = 1; i <= query.length; i++) {
      const q = query.slice(0, i);
      const reuse = canReuse(prevQuery, q) ? previous : undefined;
      const start = performance.now();
      const results = search(index, q, reuse);
      timings.push(performance.now() - start);
      previous = results;
      prevQuery = q;
    }

    const worst = Math.max(...timings);
    expect(worst, `slowest keystroke was ${worst.toFixed(2)}ms`).toBeLessThan(16);
  });

  it('stays under budget for a cold single-character query, the worst case', () => {
    const index = buildIndex(tabs, categoryOf);
    // A one-character query with no previous results scans all 800 entries.
    const timings = ['a', 'e', 'o', 's', 't'].map((c) => {
      const start = performance.now();
      search(index, c);
      return performance.now() - start;
    });
    const worst = Math.max(...timings);
    expect(worst, `slowest cold keystroke was ${worst.toFixed(2)}ms`).toBeLessThan(16);
  });
});
