import { describe, it, expect } from 'vitest';
import { generateFixture, FIXTURE_SIZES, BOUNDARY_AGES } from './generate';
import { createMockChrome } from '../mocks/chrome';

/**
 * The Phase 0 gate. If the fixture does not actually contain the shapes the features are
 * built against, every downstream test is measuring nothing.
 */
describe('fixture generator', () => {
  it.each(FIXTURE_SIZES)('produces at least %i tabs', (size) => {
    const f = generateFixture(size);
    expect(f.tabs.length).toBeGreaterThanOrEqual(size);
  });

  it('is deterministic for a given seed, and different across seeds', () => {
    const a = generateFixture(200, 7);
    const b = generateFixture(200, 7);
    const c = generateFixture(200, 8);
    expect(a.tabs.map((t) => t.url)).toEqual(b.tabs.map((t) => t.url));
    expect(a.tabs.map((t) => t.url)).not.toEqual(c.tabs.map((t) => t.url));
  });

  it('assigns unique tab ids and spreads across multiple windows', () => {
    const f = generateFixture(400);
    expect(new Set(f.tabs.map((t) => t.id)).size).toBe(f.tabs.length);
    expect(new Set(f.tabs.map((t) => t.windowId)).size).toBeGreaterThan(1);
  });

  it('plants duplicate clusters at all three tiers plus the hash-route case', () => {
    const f = generateFixture(400);
    const urls = f.tabs.map((t) => t.url);
    // exact
    expect(urls.filter((u) => u === f.planted.exact[0]).length).toBeGreaterThanOrEqual(4);
    // canonical: same base, differing tracking params
    expect(urls.filter((u) => u.startsWith(f.planted.canonical[0]!)).length).toBeGreaterThanOrEqual(4);
    // same-page: same origin+path, differing real query
    expect(urls.filter((u) => u.startsWith(f.planted.samePage[0]!)).length).toBeGreaterThanOrEqual(3);
    // hash-routed SPA: distinct routes that must NOT collapse
    const hashRoutes = urls.filter((u) => u.startsWith('https://app.example.com/#/'));
    expect(new Set(hashRoutes).size).toBe(3);
  });

  it('seeds a tab at every staleness boundary and one second either side', () => {
    const f = generateFixture(400);
    for (const age of BOUNDARY_AGES) {
      const tab = f.tabs.find((t) => t.url === `https://boundary.example/age/${age}`);
      expect(tab, `missing boundary tab for age ${age}`).toBeDefined();
      expect(tab!.lastAccessed).toBe(f.now - age);
    }
  });

  it('includes never-activated, pinned, audible, muted, discarded and grouped tabs', () => {
    const f = generateFixture(400);
    expect(f.tabs.some((t) => t.lastAccessed === undefined)).toBe(true);
    expect(f.tabs.filter((t) => t.pinned).length).toBeGreaterThanOrEqual(2);
    expect(f.tabs.some((t) => t.audible)).toBe(true);
    expect(f.tabs.some((t) => t.mutedInfo.muted)).toBe(true);
    expect(f.tabs.some((t) => t.discarded)).toBe(true);
    expect(f.tabs.some((t) => t.groupId === 900)).toBe(true);
  });

  it('includes the pathological cases that break naive parsers', () => {
    const f = generateFixture(400);
    const urls = f.tabs.map((t) => t.url);
    expect(urls).toContain('about:blank');
    expect(urls.some((u) => u.startsWith('chrome://'))).toBe(true);
    expect(urls.some((u) => u.length > 500)).toBe(true);
    // Identical titles, different URLs — must never be collapsed as duplicates.
    // Scoped to the planted pair: the catalog also produces *genuine* same-title
    // duplicates (localhost "Dashboard"), which is realistic and wanted.
    const planted = f.tabs.filter((t) => t.title === 'Dashboard' && t.url.startsWith('https://example.org/'));
    expect(planted.length).toBe(2);
    expect(new Set(planted.map((t) => t.url)).size).toBe(2);
    // non-Latin titles
    expect(f.tabs.some((t) => /[　-鿿Ѐ-ӿ؀-ۿ]/.test(t.title))).toBe(true);
  });
});

describe('mock chrome', () => {
  it('serves the fixture through tabs.query and supports create/remove round-trip', async () => {
    const c = createMockChrome(200);
    const before = await c.tabs.query({});
    expect(before.length).toBeGreaterThanOrEqual(200);

    const created = await c.tabs.create({ url: 'https://new.example/', windowId: 100 });
    expect((await c.tabs.query({})).length).toBe(before.length + 1);

    await c.tabs.remove(created.id);
    expect((await c.tabs.query({})).length).toBe(before.length);
  });

  it('emits events and supports listener teardown', async () => {
    const c = createMockChrome(50);
    const seen: number[] = [];
    const listener = (id: number): void => void seen.push(id);
    c.tabs.onRemoved.addListener(listener);
    const [first] = await c.tabs.query({});
    await c.tabs.remove(first!.id);
    expect(seen).toEqual([first!.id]);

    c.tabs.onRemoved.removeListener(listener);
    expect(c.tabs.onRemoved.count()).toBe(0);
  });

  it('round-trips storage.local and reports bytes in use', async () => {
    const c = createMockChrome(50);
    await c.storage.local.set({ 'td.test': { a: 1 } });
    expect(await c.storage.local.get('td.test')).toEqual({ 'td.test': { a: 1 } });
    expect(await c.storage.local.getBytesInUse()).toBeGreaterThan(0);
    await c.storage.local.remove('td.test');
    expect(await c.storage.local.get('td.test')).toEqual({});
  });

  it('groups tabs and reflects membership', async () => {
    const c = createMockChrome(50);
    const [a, b] = await c.tabs.query({});
    const gid = await c.tabs.group({ tabIds: [a!.id, b!.id] });
    const after = await c.tabs.query({});
    expect(after.filter((t) => t.groupId === gid).length).toBe(2);
  });
});
