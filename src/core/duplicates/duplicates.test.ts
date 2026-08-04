import { describe, it, expect } from 'vitest';
import { canonicalize, isRouteFragment, samePageKey, DEFAULT_TRACKING_PARAMS } from './canonical';
import { findDuplicates, duplicateStats, protectionReason } from './cluster';
import type { TabSnapshot } from '@/types/tab';
import { generateFixture } from '@/test/fixtures/generate';

let seq = 0;
const t = (url: string, over: Partial<TabSnapshot> = {}): TabSnapshot => ({
  id: ++seq, url, title: 'x', domain: 'example.com', windowId: 1, index: 0, groupId: -1,
  pinned: false, audible: false, muted: false, discarded: false, active: false,
  lastActiveAt: 1000, lastActiveInferred: false, createdAt: 0, ...over,
});

describe('canonicalize', () => {
  it('strips tracking params but keeps real ones', () => {
    expect(canonicalize('https://x.com/a?utm_source=t&utm_medium=s&id=5')).toBe('https://x.com/a?id=5');
    expect(canonicalize('https://x.com/a?fbclid=z')).toBe('https://x.com/a');
    expect(canonicalize('https://x.com/a?gclid=z&ref=hn&q=search')).toBe('https://x.com/a?q=search');
  });

  it('sorts surviving params so order does not create false distinctions', () => {
    expect(canonicalize('https://x.com/a?b=2&a=1')).toBe(canonicalize('https://x.com/a?a=1&b=2'));
  });

  it('normalises www, trailing slashes and default ports', () => {
    expect(canonicalize('https://www.x.com/a/')).toBe('https://x.com/a');
    expect(canonicalize('https://x.com:443/a')).toBe('https://x.com/a');
    expect(canonicalize('http://x.com:80/a')).toBe('http://x.com/a');
    expect(canonicalize('https://x.com/')).toBe('https://x.com');
  });

  it('keeps a non-default port, which is a genuinely different server', () => {
    expect(canonicalize('http://localhost:5173/a')).toContain(':5173');
    expect(canonicalize('http://localhost:5173/a')).not.toBe(canonicalize('http://localhost:3000/a'));
  });

  it('passes through non-http URLs unchanged instead of throwing', () => {
    expect(canonicalize('about:blank')).toBe('about:blank');
    expect(canonicalize('chrome://extensions/')).toBe('chrome://extensions/');
    expect(canonicalize('not a url')).toBe('not a url');
    expect(() => canonicalize('')).not.toThrow();
  });

  it('respects a caller-supplied tracking param list', () => {
    expect(canonicalize('https://x.com/a?sid=1', { trackingParams: ['sid'] })).toBe('https://x.com/a');
    // and leaves it alone when it is not on the list
    expect(canonicalize('https://x.com/a?sid=1', { trackingParams: [] })).toBe('https://x.com/a?sid=1');
  });

  it('ships a maintained default list covering the common offenders', () => {
    for (const p of ['utm_*', 'fbclid', 'gclid', 'ref', 'mc_cid']) {
      expect(DEFAULT_TRACKING_PARAMS).toContain(p);
    }
  });
});

/** The case a naive "strip the fragment" canonicaliser destroys. */
describe('hash-routed SPAs', () => {
  it.each([
    ['/', '#/inbox', true],
    ['', '#/inbox', true],
    ['/mail/u/0/', '#inbox/msg123', true],
    ['/a', '#!/route', true],
    ['/docs/fetch', '#syntax', false],
    ['/docs/fetch', '#section-2', false],
    ['/a', '', false],
    ['/a', '#', false],
  ])('path %s + hash %s -> route: %s', (path, hash, expected) => {
    expect(isRouteFragment(path, hash)).toBe(expected);
  });

  it('keeps distinct SPA routes distinct', () => {
    const urls = ['https://app.example.com/#/inbox', 'https://app.example.com/#/settings/billing', 'https://app.example.com/#/projects/42'];
    expect(new Set(urls.map((u) => canonicalize(u))).size).toBe(3);
    expect(findDuplicates(urls.map((u) => t(u)))).toEqual([]);
  });

  it('still collapses a plain anchor onto its bare page', () => {
    const a = 'https://developer.mozilla.org/en-US/docs/Web/API/fetch#syntax';
    const b = 'https://developer.mozilla.org/en-US/docs/Web/API/fetch';
    expect(canonicalize(a)).toBe(canonicalize(b));
    const clusters = findDuplicates([t(a), t(b)]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.tier).toBe('canonical');
  });

  it('does not collapse two different routes under the same non-root path', () => {
    const a = 'https://mail.google.com/mail/u/0/#inbox/abc';
    const b = 'https://mail.google.com/mail/u/0/#inbox/def';
    expect(canonicalize(a)).not.toBe(canonicalize(b));
  });
});

describe('findDuplicates — tiers are mutually exclusive', () => {
  it('reports byte-identical URLs once, as exact', () => {
    const url = 'https://github.com/a/b';
    const clusters = findDuplicates([t(url), t(url), t(url)]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.tier).toBe('exact');
    expect(clusters[0]!.close).toHaveLength(2);
  });

  it('reports a tracking-param family as canonical, not exact', () => {
    const base = 'https://n.com/story';
    const clusters = findDuplicates([t(base), t(`${base}?utm_source=x`), t(`${base}/`)]);
    expect(clusters.map((c) => c.tier)).toEqual(['canonical']);
    expect(clusters[0]!.close).toHaveLength(2);
  });

  it('reports differing real queries as samePage only', () => {
    const clusters = findDuplicates([t('https://a.com/s?k=1'), t('https://a.com/s?k=2')]);
    expect(clusters.map((c) => c.tier)).toEqual(['samePage']);
  });

  it('never double-counts a tab within a cluster', () => {
    const f = generateFixture(400);
    const tabs = f.tabs.map((x) => t(x.url, { id: x.id, pinned: x.pinned, audible: x.audible }));
    for (const c of findDuplicates(tabs)) {
      const ids = [c.keep.id, ...c.close.map((x) => x.id), ...c.protectedTabs.map((p) => p.tab.id)];
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('never proposes closing the same tab from two different clusters', () => {
    // Regression: exact and canonical tiers both claimed the byte-identical pair, so a
    // 4-tab family reported "close 1" AND "close 3" — i.e. close all four.
    const tabs = [
      t('https://x.com/a'),
      t('https://x.com/a'),
      t('https://x.com/a?utm_source=z'),
      t('https://x.com/a/'),
    ];
    const clusters = findDuplicates(tabs);
    const closing = clusters.flatMap((c) => c.close.map((x) => x.id));
    expect(new Set(closing).size).toBe(closing.length);
    expect(closing).toHaveLength(3); // exactly one survivor out of four
  });

  it('never proposes closing a tab that another cluster is keeping', () => {
    const f = generateFixture(400);
    const tabs = f.tabs.map((x) => t(x.url, { id: x.id, pinned: x.pinned, audible: x.audible }));
    const clusters = findDuplicates(tabs);
    const closing = clusters.flatMap((c) => c.close.map((x) => x.id));
    expect(new Set(closing).size, 'a tab is slated for closing twice').toBe(closing.length);
    // Closing every proposed tab must never empty a cluster of its keeper.
    const closingSet = new Set(closing);
    for (const c of clusters) {
      expect(closingSet.has(c.keep.id), `cluster ${c.id} would lose its survivor`).toBe(false);
    }
  });

  it('finds every planted cluster in the fixture', () => {
    const f = generateFixture(400);
    const tabs = f.tabs.map((x) => t(x.url, { id: x.id }));
    const clusters = findDuplicates(tabs);
    const keys = clusters.map((c) => c.key);
    expect(keys.some((k) => k.includes('vitejs/vite/issues/14032'))).toBe(true);
    expect(keys.some((k) => k.includes('tab-overload'))).toBe(true);
    expect(keys.some((k) => k.includes('amazon.com/s'))).toBe(true);
  });

  it('produces no false positives on distinct URLs', () => {
    const distinct = ['https://a.com/1', 'https://a.com/2', 'https://b.com/1', 'about:blank', 'chrome://settings/'];
    expect(findDuplicates(distinct.map((u) => t(u)))).toEqual([]);
  });

  it('never treats identical titles with different URLs as duplicates', () => {
    const tabs = [t('https://example.org/a', { title: 'Dashboard' }), t('https://example.org/b', { title: 'Dashboard' })];
    expect(findDuplicates(tabs)).toEqual([]);
  });
});

describe('protection', () => {
  it.each([
    [{ pinned: true }, 'Pinned'],
    [{ audible: true }, 'Playing audio'],
    [{ active: true }, 'Currently open'],
    [{ title: '*Untitled document' }, 'Title starts with * — unsaved changes'],
    [{ title: 'Draft: postmortem' }, 'Looks like a draft'],
  ])('protects %o', (over, reason) => {
    expect(protectionReason(t('https://x.com/a', over))).toBe(reason);
  });

  it.each(['docs.google.com', 'figma.com', 'notion.so', 'mail.google.com'])(
    'protects the editor origin %s',
    (domain) => {
      expect(protectionReason(t(`https://${domain}/doc/1`))).toBe('Editor — may hold unsaved work');
    },
  );

  it('leaves an ordinary tab unprotected', () => {
    expect(protectionReason(t('https://example.com/a'))).toBeNull();
  });

  it('excludes protected tabs from the close set but still reports them', () => {
    const url = 'https://github.com/a/b';
    const clusters = findDuplicates([t(url), t(url, { pinned: true }), t(url)]);
    const c = clusters[0]!;
    expect(c.close.every((x) => !x.pinned)).toBe(true);
    expect(c.protectedTabs.map((p) => p.reason)).toContain('Pinned');
  });
});

describe('keep strategy', () => {
  const url = 'https://github.com/a/b';
  it('keeps the newest by default', () => {
    const [old_, mid, recent] = [t(url, { lastActiveAt: 1 }), t(url, { lastActiveAt: 5 }), t(url, { lastActiveAt: 9 })];
    expect(findDuplicates([old_!, mid!, recent!])[0]!.keep.id).toBe(recent!.id);
  });
  it('keeps the oldest when asked', () => {
    const [old_, recent] = [t(url, { lastActiveAt: 1 }), t(url, { lastActiveAt: 9 })];
    expect(findDuplicates([old_!, recent!], { strategy: 'oldest' })[0]!.keep.id).toBe(old_!.id);
  });
  it('prefers a pinned survivor when asked', () => {
    const [plain, pin] = [t(url, { lastActiveAt: 9 }), t(url, { lastActiveAt: 1, pinned: true })];
    expect(findDuplicates([plain!, pin!], { strategy: 'pinned' })[0]!.keep.id).toBe(pin!.id);
  });
  it('breaks ties deterministically', () => {
    const tabs = [t(url, { lastActiveAt: 5 }), t(url, { lastActiveAt: 5 })];
    expect(findDuplicates(tabs)[0]!.keep.id).toBe(findDuplicates(tabs)[0]!.keep.id);
  });
});

describe('duplicateStats', () => {
  it('totals closable tabs per tier', () => {
    const f = generateFixture(400);
    const clusters = findDuplicates(f.tabs.map((x) => t(x.url, { id: x.id })));
    const s = duplicateStats(clusters);
    expect(s.clusters).toBe(clusters.length);
    expect(s.closable).toBe(s.byTier.exact + s.byTier.canonical + s.byTier.samePage);
    expect(s.closable).toBeGreaterThan(0);
  });
});

describe('samePageKey', () => {
  it('ignores the query entirely', () => {
    expect(samePageKey('https://a.com/s?k=1')).toBe(samePageKey('https://a.com/s?k=2'));
  });
  it('does not merge different paths', () => {
    expect(samePageKey('https://a.com/s')).not.toBe(samePageKey('https://a.com/t'));
  });
  it('passes malformed input through', () => {
    expect(samePageKey('nonsense')).toBe('nonsense');
  });
});
