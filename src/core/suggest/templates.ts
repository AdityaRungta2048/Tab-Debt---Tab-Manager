import type { Category, DebtInput, TabSnapshot } from '@/types/tab';
import type { Suggestion } from '@/types/suggestion';
import { classifyAll } from '../categorize/classify';
import type { Overrides } from '../categorize/classify';
import { findDuplicates } from '../duplicates/cluster';
import { protectionReason } from '../duplicates/cluster';
import { estimateTotalMb, DEFAULT_WEIGHTS, type MemoryWeights } from '../memory/estimate';
import { formatDuration } from '../staleness/buckets';

const DAY = 86_400_000;
/** A tab is "stale" once it has gone a week untouched — the same horizon the score uses. */
const STALE_MS = 7 * DAY;
/** Above this many tabs, a sweep bookmarks before closing. Nobody should lose 70 tabs. */
const BOOKMARK_THRESHOLD = 20;

export type TemplateContext = {
  input: DebtInput;
  overrides: Overrides;
  weights: MemoryWeights;
  trackingParams?: string[] | undefined;
};

const plural = (n: number, one: string, many = `${one}s`): string => (n === 1 ? one : many);

/** Tabs safe to auto-select. Pinned / audible / editor / draft tabs are never swept up. */
const sweepable = (tabs: TabSnapshot[]): TabSnapshot[] => tabs.filter((t) => !protectionReason(t));

const isStale = (t: TabSnapshot, now: number): boolean =>
  t.lastActiveAt === null || now - t.lastActiveAt >= STALE_MS;

function medianAge(tabs: TabSnapshot[], now: number): number {
  const ages = tabs
    .map((t) => (t.lastActiveAt === null ? Infinity : now - t.lastActiveAt))
    .filter((a) => Number.isFinite(a))
    .sort((a, b) => a - b);
  return ages.length ? (ages[Math.floor(ages.length / 2)] ?? 0) : 0;
}

function mb(tabs: TabSnapshot[], weights: MemoryWeights): number {
  return estimateTotalMb(tabs, weights);
}

/** Duplicate clusters — the safest possible win, so the highest confidence in the product. */
export function duplicateSuggestions(ctx: TemplateContext): Suggestion[] {
  const clusters = findDuplicates(
    ctx.input.tabs,
    ctx.trackingParams ? { trackingParams: ctx.trackingParams } : {},
  );
  // The same-page tier is genuinely risky (two different searches are not one page), so it
  // never becomes a one-click suggestion — it stays preview-only in the dashboard.
  const safe = clusters.filter((c) => c.tier !== 'samePage');
  const tabs = safe.flatMap((c) => c.close);
  if (tabs.length < 3) return [];
  return [
    {
      id: 'dup:all',
      headline: `Close ${tabs.length} duplicate ${plural(tabs.length, 'tab')}`,
      detail: `${tabs.length} ${plural(tabs.length, 'copy', 'copies')} across ${safe.length} ${plural(safe.length, 'group')}. The most recent of each stays open.`,
      tabIds: tabs.map((t) => t.id),
      estimatedMb: mb(tabs, ctx.weights),
      action: { kind: 'close', tabIds: tabs.map((t) => t.id) },
      confidence: 0.95,
      template: 'duplicates',
    },
  ];
}

/** Domain pileups: many tabs from one host, most of them untouched. */
export function domainPileupSuggestions(ctx: TemplateContext): Suggestion[] {
  const { now } = ctx.input;
  const byDomain = new Map<string, TabSnapshot[]>();
  for (const t of ctx.input.tabs) {
    if (!t.domain) continue;
    const list = byDomain.get(t.domain);
    if (list) list.push(t);
    else byDomain.set(t.domain, [t]);
  }

  const out: Suggestion[] = [];
  for (const [domain, all] of byDomain) {
    if (all.length < 8) continue;
    const stale = sweepable(all.filter((t) => isStale(t, now)));
    if (stale.length < 3) continue;
    const median = medianAge(stale, now);
    out.push({
      id: `pile:${domain}`,
      headline: `Group ${stale.length} stale ${domain} ${plural(stale.length, 'tab')}`,
      detail: `${all.length} ${domain} tabs open, ${stale.length} untouched for ${formatDuration(median).replace(' ago', '')} or more.`,
      tabIds: stale.map((t) => t.id),
      estimatedMb: 0, // grouping frees nothing; claiming otherwise would be a lie
      action: { kind: 'group', tabIds: stale.map((t) => t.id), title: domain },
      confidence: 0.75,
      template: 'domainPileup',
    });
  }
  return out;
}

/** Video tabs that were opened and never actually watched. */
export function neverWatchedSuggestions(ctx: TemplateContext): Suggestion[] {
  const videos = ctx.input.tabs.filter(
    (t) =>
      (t.domain === 'youtube.com' || t.domain === 'vimeo.com' || t.domain === 'twitch.tv') &&
      t.lastActiveAt === null,
  );
  const tabs = sweepable(videos);
  if (tabs.length < 3) return [];
  return [
    {
      id: 'video:never',
      headline: `Close ${tabs.length} unwatched ${plural(tabs.length, 'video')}`,
      detail: `${tabs.length} video ${plural(tabs.length, 'tab')} opened but never played. Nothing is playing audio.`,
      tabIds: tabs.map((t) => t.id),
      estimatedMb: mb(tabs, ctx.weights),
      action: { kind: 'close', tabIds: tabs.map((t) => t.id) },
      confidence: 0.85,
      template: 'neverWatched',
    },
  ];
}

/** Stale category sweeps — usually the highest-leverage move in a large tab set. */
export function staleCategorySuggestions(ctx: TemplateContext): Suggestion[] {
  const { now } = ctx.input;
  const cats = classifyAll(ctx.input.tabs, ctx.overrides);
  const byCategory = new Map<Category, TabSnapshot[]>();
  for (const t of ctx.input.tabs) {
    const c = cats.get(t)?.category ?? 'Other';
    const list = byCategory.get(c);
    if (list) list.push(t);
    else byCategory.set(c, [t]);
  }

  const out: Suggestion[] = [];
  for (const [category, all] of byCategory) {
    const stale = sweepable(all.filter((t) => isStale(t, now)));
    if (stale.length < 3) continue;
    const median = medianAge(stale, now);
    const big = stale.length >= BOOKMARK_THRESHOLD;
    const age = formatDuration(median).replace(' ago', '');
    // "Other" is an internal bucket name; saying "18 stale Other tabs" to a person is
    // jargon leaking into copy.
    const label = category === 'Other' ? 'uncategorised' : category;
    out.push({
      id: `stale:${category}`,
      headline: big
        ? `Bookmark and close ${stale.length} ${label} ${plural(stale.length, 'tab')}`
        : `Close ${stale.length} stale ${label} ${plural(stale.length, 'tab')}`,
      detail: `${all.length} ${label} ${plural(all.length, 'tab')} open, ${stale.length} untouched for ${age} or more.${big ? ' They are saved to bookmarks first.' : ''}`,
      tabIds: stale.map((t) => t.id),
      estimatedMb: mb(stale, ctx.weights),
      action: big
        ? { kind: 'bookmarkAndClose', tabIds: stale.map((t) => t.id), folder: category }
        : { kind: 'close', tabIds: stale.map((t) => t.id) },
      // Older sweeps are safer bets. A week-old set is a judgement call; a two-month-old
      // set is not, and the ranking should reflect that rather than treating them alike.
      confidence: Math.min(0.85, 0.45 + median / (60 * DAY)),
      template: 'staleCategory',
    });
  }
  return out;
}

/** Window sprawl: small stray windows that belong back in the main one. */
export function windowSprawlSuggestions(ctx: TemplateContext): Suggestion[] {
  const windows = new Map<number, TabSnapshot[]>();
  for (const t of ctx.input.tabs) {
    const list = windows.get(t.windowId);
    if (list) list.push(t);
    else windows.set(t.windowId, [t]);
  }
  if (windows.size < 3) return [];

  const sorted = [...windows.entries()].sort((a, b) => a[1].length - b[1].length);
  const strays = sorted.slice(0, Math.max(0, sorted.length - 1)).filter(([, l]) => l.length <= 15);
  const tabs = sweepable(strays.flatMap(([, l]) => l));
  if (tabs.length < 3 || strays.length < 2) return [];

  return [
    {
      id: 'sprawl:merge',
      headline: `Group ${tabs.length} ${plural(tabs.length, 'tab')} from ${strays.length} small windows`,
      detail: `${windows.size} windows are open. These ${strays.length} hold ${tabs.length} tabs between them.`,
      tabIds: tabs.map((t) => t.id),
      estimatedMb: 0,
      action: { kind: 'group', tabIds: tabs.map((t) => t.id), title: 'Collected' },
      confidence: 0.6,
      template: 'windowSprawl',
    },
  ];
}

export const TEMPLATES = [
  duplicateSuggestions,
  staleCategorySuggestions,
  domainPileupSuggestions,
  neverWatchedSuggestions,
  windowSprawlSuggestions,
];

export const DEFAULT_CONTEXT_WEIGHTS = DEFAULT_WEIGHTS;
