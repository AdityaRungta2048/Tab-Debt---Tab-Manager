import type { DebtInput } from '@/types/tab';
import type { Suggestion } from '@/types/suggestion';
import type { Overrides } from '../categorize/classify';
import { DEFAULT_WEIGHTS, type MemoryWeights } from '../memory/estimate';
import { TEMPLATES, type TemplateContext } from './templates';

export const MAX_SUGGESTIONS = 5;
export const MIN_AFFECTED = 3;

export type SuggestOptions = {
  overrides?: Overrides;
  weights?: MemoryWeights;
  trackingParams?: string[];
  limit?: number;
};

/** Leverage: how many tabs this recovers, discounted by how sure we are it should go. */
export function rankValue(s: Suggestion): number {
  return s.tabIds.length * s.confidence;
}

/**
 * Generate, de-overlap, and rank.
 *
 * The de-overlap pass matters more than it looks: without it the same 40 stale GitHub tabs
 * appear in the duplicates suggestion, the domain pileup, and the Development sweep, and
 * the three counts on screen add up to more tabs than the user has. Each tab is claimed by
 * the highest-ranked suggestion that wants it, and anything that falls below the minimum
 * after losing its overlap is dropped rather than shown with a quietly shrunken count.
 */
export function suggest(input: DebtInput, opts: SuggestOptions = {}): Suggestion[] {
  const ctx: TemplateContext = {
    input,
    overrides: opts.overrides ?? {},
    weights: opts.weights ?? DEFAULT_WEIGHTS,
    trackingParams: opts.trackingParams,
  };

  const byId = new Map(input.tabs.map((t) => [t.id, t]));
  const generated = TEMPLATES.flatMap((template) => template(ctx));

  const ordered = generated
    .filter((s) => s.tabIds.length >= MIN_AFFECTED)
    .sort((a, b) => rankValue(b) - rankValue(a) || a.id.localeCompare(b.id));

  const claimed = new Set<number>();
  const out: Suggestion[] = [];

  for (const s of ordered) {
    if (out.length >= (opts.limit ?? MAX_SUGGESTIONS)) break;
    const remaining = s.tabIds.filter((id) => !claimed.has(id));
    if (remaining.length < MIN_AFFECTED) continue;

    const final =
      remaining.length === s.tabIds.length
        ? s
        : rebuild(s, remaining, ctx.weights, (id) => byId.get(id));

    for (const id of final.tabIds) claimed.add(id);
    out.push(final);
  }

  return out;
}

/**
 * Rebuild a suggestion after de-overlap so every number it shows is the number it will
 * actually act on. Headline and detail are regenerated rather than patched, because a
 * headline that says 40 next to an action that closes 12 is exactly the kind of thing
 * that destroys trust in a destructive tool.
 */
function rebuild(
  s: Suggestion,
  tabIds: number[],
  weights: MemoryWeights,
  lookup: (id: number) => { discarded: boolean; url: string; audible: boolean } | undefined,
): Suggestion {
  const n = tabIds.length;
  const headline = s.headline.replace(/\b\d+\b/, String(n));
  const estimatedMb =
    s.estimatedMb === 0
      ? 0
      : tabIds.reduce((sum, id) => {
          const tab = lookup(id);
          if (!tab) return sum;
          return sum + (tab.discarded ? weights.discarded : weights.base);
        }, 0);

  const action: Suggestion['action'] =
    s.action.kind === 'group'
      ? { ...s.action, tabIds }
      : s.action.kind === 'bookmarkAndClose'
        ? { ...s.action, tabIds }
        : { ...s.action, tabIds };

  return {
    ...s,
    headline,
    detail: `${s.detail} ${s.tabIds.length - n} of these are covered by a higher-priority action above.`,
    tabIds,
    estimatedMb,
    action,
  };
}

/** Total tabs the whole suggestion list would recover, for the "pay this down" summary. */
export function totalRecoverable(suggestions: Suggestion[]): number {
  return new Set(suggestions.flatMap((s) => s.tabIds)).size;
}
