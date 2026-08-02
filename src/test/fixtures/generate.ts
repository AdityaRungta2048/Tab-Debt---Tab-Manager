import { CATALOG, AWKWARD_TITLES, USERS, SLUGS, type CatalogEntry } from './catalog';

/** A chrome.tabs.Tab-shaped record. We generate at the Chrome layer, not the domain layer,
 *  so the fixture exercises services/ conversion too rather than skipping past it. */
export type FixtureTab = {
  id: number;
  index: number;
  windowId: number;
  url: string;
  title: string;
  pinned: boolean;
  audible: boolean;
  mutedInfo: { muted: boolean };
  discarded: boolean;
  active: boolean;
  groupId: number;
  favIconUrl?: string;
  lastAccessed?: number;
};

export type Fixture = {
  tabs: FixtureTab[];
  windowIds: number[];
  now: number;
  /** Clusters the generator deliberately planted, so tests assert against intent. */
  planted: {
    exact: string[];
    canonical: string[];
    samePage: string[];
    hashRoute: string[];
  };
};

const DAY = 86_400_000;
const SEC = 1000;

/** mulberry32 — small, fast, and deterministic so fixtures are reproducible across runs. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(r: () => number, xs: readonly T[]): T {
  const v = xs[Math.floor(r() * xs.length)];
  if (v === undefined) throw new Error('pick from empty array');
  return v;
}

function hash(r: () => number, n = 12): string {
  const alpha = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: n }, () => pick(r, alpha.split(''))).join('');
}

function fill(r: () => number, tpl: string): string {
  return tpl
    .replace(/\{n\}/g, () => String(1000 + Math.floor(r() * 89_000)))
    .replace(/\{h\}/g, () => hash(r))
    .replace(/\{u\}/g, () => pick(r, USERS))
    .replace(/\{r\}/g, () => pick(r, SLUGS));
}

function weightedCatalog(r: () => number): CatalogEntry {
  const total = CATALOG.reduce((s, e) => s + e.weight, 0);
  let t = r() * total;
  for (const e of CATALOG) {
    t -= e.weight;
    if (t <= 0) return e;
  }
  return CATALOG[0] as CatalogEntry;
}

/**
 * Staleness ages placed *exactly* on each bucket edge and one second either side, so the
 * bucketing tests assert real boundary behaviour rather than comfortable midpoints.
 * Edges are 1d / 2d / 7d / 30d (see DECISIONS.md D-004).
 */
export const BOUNDARY_AGES = [
  0,
  DAY - SEC,
  DAY,
  DAY + SEC,
  2 * DAY - SEC,
  2 * DAY,
  2 * DAY + SEC,
  7 * DAY - SEC,
  7 * DAY,
  7 * DAY + SEC,
  30 * DAY - SEC,
  30 * DAY,
  30 * DAY + SEC,
  90 * DAY,
];

export function generateFixture(size: number, seed = 42): Fixture {
  const r = rng(seed);
  const now = Date.UTC(2026, 6, 15, 12, 0, 0); // fixed clock => reproducible ages
  const tabs: FixtureTab[] = [];
  const planted: Fixture['planted'] = { exact: [], canonical: [], samePage: [], hashRoute: [] };

  // More tabs => more windows, but sub-linearly. 800 tabs in 6 windows is the real shape.
  const windowCount = Math.max(1, Math.min(6, Math.round(Math.log2(size / 25) + 1)));
  const windowIds = Array.from({ length: windowCount }, (_, i) => 100 + i);
  let nextId = 1;

  const push = (t: Partial<FixtureTab> & { url: string; title: string }): FixtureTab => {
    const windowId = pick(r, windowIds);
    const tab: FixtureTab = {
      id: nextId++,
      index: tabs.filter((x) => x.windowId === windowId).length,
      windowId,
      pinned: false,
      audible: false,
      mutedInfo: { muted: false },
      discarded: false,
      active: false,
      groupId: -1,
      lastAccessed: now - Math.floor(r() * 45 * DAY),
      ...t,
    };
    tabs.push(tab);
    return tab;
  };

  // --- Planted duplicate clusters, all three tiers -------------------------------------
  // Exact: byte-identical URL.
  const exactUrl = 'https://github.com/vitejs/vite/issues/14032';
  planted.exact.push(exactUrl);
  for (let i = 0; i < 4; i++) push({ url: exactUrl, title: 'Build fails on Node 22 · Issue #14032' });

  // Canonical: identical once tracking params and trailing slash are stripped.
  const canonBase = 'https://www.nytimes.com/2026/07/02/technology/tab-overload.html';
  planted.canonical.push(canonBase);
  for (const q of ['', '?utm_source=twitter&utm_medium=social', '?fbclid=IwAR9x', '?ref=hn', '/']) {
    push({ url: canonBase + q, title: 'The Quiet Cost of 400 Open Tabs - The New York Times' });
  }

  // Same-page: same origin+path, genuinely different query (a real search, not tracking).
  const samePage = 'https://www.amazon.com/s';
  planted.samePage.push(samePage);
  for (const q of ['?k=keyboard', '?k=keyboard&rh=p_36', '?k=mechanical+keyboard']) {
    push({ url: samePage + q, title: 'Amazon.com : keyboard' });
  }

  // Hash-routed SPA: fragment is a ROUTE, so these are distinct pages, not duplicates.
  // This is the case a naive "strip the fragment" canonicaliser destroys.
  planted.hashRoute.push('https://app.example.com/');
  for (const frag of ['#/inbox', '#/settings/billing', '#/projects/42']) {
    push({ url: `https://app.example.com/${frag}`, title: `App ${frag}` });
  }
  // ...whereas a fragment on a real path IS just an anchor and should be stripped.
  push({ url: 'https://developer.mozilla.org/en-US/docs/Web/API/fetch#syntax', title: 'fetch() - MDN' });
  push({ url: 'https://developer.mozilla.org/en-US/docs/Web/API/fetch', title: 'fetch() - MDN' });

  // --- Boundary-aged tabs --------------------------------------------------------------
  for (const age of BOUNDARY_AGES) {
    push({
      url: `https://boundary.example/age/${age}`,
      title: `Boundary ${age}ms`,
      lastAccessed: now - age,
    });
  }

  // --- Pathological cases --------------------------------------------------------------
  push({ url: 'about:blank', title: 'about:blank' });
  push({ url: 'chrome://extensions/', title: 'Extensions' });
  push({ url: 'chrome://settings/', title: 'Settings' });
  push({ url: `https://example.com/${'deep/'.repeat(60)}?${'k=v&'.repeat(100)}`, title: 'Very long URL' });
  // Identical titles, different URLs — must NOT be treated as duplicates.
  push({ url: 'https://example.org/a', title: 'Dashboard' });
  push({ url: 'https://example.org/b', title: 'Dashboard' });
  for (const t of AWKWARD_TITLES) push({ url: `https://i18n.example/${hash(r, 6)}`, title: t });

  // --- Bulk realistic fill -------------------------------------------------------------
  while (tabs.length < size) {
    const entry = weightedCatalog(r);
    const path = fill(r, pick(r, entry.paths));
    const title = fill(r, pick(r, entry.titles));
    const roll = r();
    push({
      url: `https://${entry.domain === 'localhost' ? 'localhost:5173' : entry.domain}${path}`,
      title,
      // ~8% never activated: the highest-signal group in the product.
      lastAccessed: roll < 0.08 ? undefined : now - Math.floor(r() ** 2 * 60 * DAY),
      discarded: roll > 0.55 && roll < 0.75,
      audible: entry.domain === 'youtube.com' && roll > 0.9,
      mutedInfo: { muted: entry.domain === 'youtube.com' && roll > 0.85 && roll <= 0.9 },
    });
  }

  // Pinned tabs live at the front of their window, as Chrome enforces.
  for (const wid of windowIds) {
    for (const t of tabs.filter((x) => x.windowId === wid).slice(0, 2)) t.pinned = true;
    const first = tabs.find((x) => x.windowId === wid);
    if (first) first.active = true;
  }

  // A couple of real tab groups, so undo's group-restoration path has something to restore.
  tabs.filter((t) => t.url.includes('github.com')).slice(0, 6).forEach((t) => (t.groupId = 900));
  tabs.filter((t) => t.url.includes('youtube.com')).slice(0, 5).forEach((t) => (t.groupId = 901));

  return { tabs: tabs.slice(0, Math.max(size, tabs.length)), windowIds, now, planted };
}

export const FIXTURE_SIZES = [50, 200, 400, 800] as const;
