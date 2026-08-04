import type { TabSnapshot } from '@/types/tab';
import type { DuplicateCluster, DuplicateTier, KeepStrategy } from '@/types/suggestion';
import { EDITOR_ORIGINS } from '../categorize/rules.data';
import { domainMatches, parseUrl } from '../url';
import { canonicalize, samePageKey } from './canonical';

/**
 * Tabs that are never auto-selected for closing. The user can still close them by hand
 * with a confirmation — this only governs what we tick on their behalf.
 */
export function protectionReason(tab: TabSnapshot): string | null {
  if (tab.pinned) return 'Pinned';
  if (tab.audible) return 'Playing audio';
  if (tab.active) return 'Currently open';
  if (/^\s*\*/.test(tab.title)) return 'Title starts with * — unsaved changes';
  if (/\bdraft\b/i.test(tab.title)) return 'Looks like a draft';
  const parsed = parseUrl(tab.url);
  if (EDITOR_ORIGINS.some((o) => domainMatches(parsed, o))) return 'Editor — may hold unsaved work';
  return null;
}

function groupBy(tabs: TabSnapshot[], key: (t: TabSnapshot) => string): Map<string, TabSnapshot[]> {
  const map = new Map<string, TabSnapshot[]>();
  for (const t of tabs) {
    const k = key(t);
    const list = map.get(k);
    if (list) list.push(t);
    else map.set(k, [t]);
  }
  return map;
}

/** Which tab survives. Ties break on tab id so previews never reorder between renders. */
function chooseKeeper(tabs: TabSnapshot[], strategy: KeepStrategy): TabSnapshot {
  const sorted = [...tabs].sort((a, b) => {
    if (strategy === 'pinned' && a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    const at = a.lastActiveAt ?? -Infinity;
    const bt = b.lastActiveAt ?? -Infinity;
    if (at !== bt) return strategy === 'oldest' ? at - bt : bt - at;
    return a.id - b.id;
  });
  return sorted[0] as TabSnapshot;
}

function buildCluster(
  tier: DuplicateTier,
  key: string,
  tabs: TabSnapshot[],
  strategy: KeepStrategy,
): DuplicateCluster {
  const keep = chooseKeeper(tabs, strategy);
  const rest = tabs.filter((t) => t.id !== keep.id);
  const protectedTabs: DuplicateCluster['protectedTabs'] = [];
  const close: TabSnapshot[] = [];
  for (const t of rest) {
    const reason = protectionReason(t);
    if (reason) protectedTabs.push({ tab: t, reason });
    else close.push(t);
  }
  return { id: `${tier}:${key}`, tier, key, keep, close, protectedTabs };
}

export type FindOptions = {
  strategy?: KeepStrategy;
  trackingParams?: string[];
};

/**
 * Three tiers, reported separately because they carry different risk. Tiers are made
 * mutually exclusive: a set of byte-identical URLs is reported once, as `exact`, and is
 * not repeated as `canonical`. Otherwise the same 19 tabs appear in three places and the
 * counts the user is asked to trust do not add up.
 */
export function findDuplicates(tabs: TabSnapshot[], opts: FindOptions = {}): DuplicateCluster[] {
  const strategy = opts.strategy ?? 'newest';
  const canonOpts = opts.trackingParams ? { trackingParams: opts.trackingParams } : {};
  const clusters: DuplicateCluster[] = [];

  // Tiers must PARTITION the tabs, not overlap. A tab already slated for closing by a
  // safer tier is withdrawn before the next tier runs; otherwise four identical-ish tabs
  // produce "close 1" plus "close 3" and the user is told to close 4 of 4.
  // `closing` = tabs a safer tier already proposes closing, withdrawn before the next tier
  // runs so no tab is ever counted twice.
  // `involved` = every tab a safer tier touched at all, including survivors. The same-page
  // tier skips these entirely: once a page has literal duplicates, "close the duplicates"
  // is the useful advice, and additionally telling the user their remaining searches are
  // "the same page" would both be noise and propose closing a tab the earlier preview just
  // promised to keep.
  const closing = new Set<number>();
  const involved = new Set<number>();
  const record = (c: DuplicateCluster): void => {
    for (const t of c.close) closing.add(t.id);
    involved.add(c.keep.id);
    for (const t of c.close) involved.add(t.id);
    for (const p of c.protectedTabs) involved.add(p.tab.id);
  };

  // Tier 1 — exact: byte-identical URL.
  for (const [key, group] of groupBy(tabs, (t) => t.url)) {
    if (group.length < 2) continue;
    const cluster = buildCluster('exact', key, group, strategy);
    record(cluster);
    clusters.push(cluster);
  }

  // Tier 2 — canonical: identical once tracking params, trailing slashes, default ports
  // and non-route fragments are removed.
  const afterExact = tabs.filter((t) => !closing.has(t.id));
  for (const [key, group] of groupBy(afterExact, (t) => canonicalize(t.url, canonOpts))) {
    if (group.length < 2) continue;
    const cluster = buildCluster('canonical', key, group, strategy);
    record(cluster);
    clusters.push(cluster);
  }

  // Tier 3 — same page, different query. The riskiest tier: two Amazon searches are not
  // the same page in any useful sense, so this is preview-only and never auto-selected
  // in bulk suggestions.
  const untouched = tabs.filter((t) => !involved.has(t.id));
  for (const [key, group] of groupBy(untouched, (t) => samePageKey(t.url))) {
    if (group.length < 2) continue;
    if (new Set(group.map((t) => canonicalize(t.url, canonOpts))).size === 1) continue;
    clusters.push(buildCluster('samePage', key, group, strategy));
  }

  // Largest first: the biggest win is the one worth previewing.
  return clusters.sort((a, b) => b.close.length - a.close.length || a.key.localeCompare(b.key));
}

export type DuplicateStats = {
  clusters: number;
  /** Tabs that could be closed, excluding keepers and protected tabs. */
  closable: number;
  byTier: Record<DuplicateTier, number>;
};

export function duplicateStats(clusters: DuplicateCluster[]): DuplicateStats {
  const byTier: Record<DuplicateTier, number> = { exact: 0, canonical: 0, samePage: 0 };
  let closable = 0;
  for (const c of clusters) {
    byTier[c.tier] += c.close.length;
    closable += c.close.length;
  }
  return { clusters: clusters.length, closable, byTier };
}
