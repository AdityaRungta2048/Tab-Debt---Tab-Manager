import type { TabSnapshot } from '@/types/tab';
import { domainMatches, parseUrl } from '../url';

/**
 * ESTIMATED memory only. There is no stable per-tab memory API in Chrome:
 * `chrome.processes` is Dev-channel only and `chrome.system.memory` reports device
 * totals. So this is a heuristic, it is labelled "estimated" everywhere it is rendered,
 * and the whole table below is exposed and editable in Settings — honest heuristic beats
 * fake precision. See DECISIONS.md D-002.
 */

export type MemoryWeights = {
  /** MB for an ordinary loaded tab. */
  base: number;
  /** MB for a discarded tab — the tab strip entry still costs something, but little. */
  discarded: number;
  /** domain pattern -> multiplier applied to `base`. */
  heavy: Record<string, number>;
};

export const DEFAULT_WEIGHTS: MemoryWeights = {
  base: 60,
  discarded: 3,
  heavy: {
    'youtube.com': 5,
    'figma.com': 6,
    'docs.google.com': 3.5,
    'sheets.google.com': 4,
    'mail.google.com': 3.5,
    'notion.so': 3,
    'linear.app': 2.5,
    'slack.com': 4,
    'discord.com': 4,
    'twitch.tv': 5,
    'netflix.com': 4.5,
    'open.spotify.com': 3,
    'meet.google.com': 6,
    'canva.com': 5,
    'app.diagrams.net': 3,
    'x.com': 2,
    'facebook.com': 2.5,
    'instagram.com': 2.5,
    'reddit.com': 2,
    'amazon.com': 2,
  },
};

/** MB for one tab. Discarded tabs short-circuit: they are the point of discarding. */
export function estimateTabMb(tab: TabSnapshot, weights: MemoryWeights = DEFAULT_WEIGHTS): number {
  if (tab.discarded) return weights.discarded;
  const parsed = parseUrl(tab.url);
  if (!parsed.domain) return Math.round(weights.base * 0.25); // about:blank, chrome://
  let multiplier = 1;
  for (const [pattern, m] of Object.entries(weights.heavy)) {
    if (domainMatches(parsed, pattern)) {
      multiplier = Math.max(multiplier, m);
    }
  }
  // An audible tab is decoding media right now, whatever the domain says.
  if (tab.audible) multiplier = Math.max(multiplier, 3);
  return Math.round(weights.base * multiplier);
}

export function estimateTotalMb(tabs: TabSnapshot[], weights: MemoryWeights = DEFAULT_WEIGHTS): number {
  return tabs.reduce((sum, t) => sum + estimateTabMb(t, weights), 0);
}

/**
 * Formats an estimate. There is no code path that renders one of these numbers without
 * the qualifier — that is enforced by test, not by discipline.
 */
export function formatMb(mb: number): string {
  if (mb < 1) return '~0 MB (estimated)';
  if (mb < 1024) return `~${Math.round(mb)} MB (estimated)`;
  return `~${(mb / 1024).toFixed(1)} GB (estimated)`;
}

/** Bare number for use inside a component that supplies its own "estimated" label. */
export function formatMbBare(mb: number): string {
  return mb < 1024 ? `${Math.round(mb)} MB` : `${(mb / 1024).toFixed(1)} GB`;
}
