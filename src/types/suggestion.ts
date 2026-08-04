import type { Category, TabSnapshot } from './tab';

export type ScoreFactorId =
  | 'count'
  | 'duplicates'
  | 'staleness'
  | 'concentration'
  | 'sprawl'
  | 'neverOpened';

export type ScoreFactor = {
  id: ScoreFactorId;
  label: string;
  /** Points this factor contributed, after its cap. */
  points: number;
  /** Ceiling for this factor, so no single factor can saturate the score. */
  cap: number;
  /** One-line plain-language explanation. Never scolding. */
  detail: string;
  /** Tabs this factor implicates, so the Balance Bar segment can act. */
  tabIds: number[];
};

export type DebtScore = {
  /** 0-100, higher is worse. */
  value: number;
  state: 'good' | 'warn' | 'bad';
  /** Sorted by points descending — the UI renders in this order. */
  factors: ScoreFactor[];
};

export type SuggestionAction =
  | { kind: 'close'; tabIds: number[] }
  | { kind: 'group'; tabIds: number[]; title: string }
  | { kind: 'bookmarkAndClose'; tabIds: number[]; folder: string }
  | { kind: 'archive'; tabIds: number[] }
  | { kind: 'mute'; tabIds: number[] }
  | { kind: 'pin'; tabIds: number[] };

export type Suggestion = {
  id: string;
  /** The verb that happens, e.g. "Close 19 duplicates". */
  headline: string;
  /** The evidence, e.g. "27 GitHub tabs, 19 untouched for over 14 days." */
  detail: string;
  tabIds: number[];
  estimatedMb: number;
  action: SuggestionAction;
  /** 0-1. Ranking is tabsRecovered × confidence. */
  confidence: number;
  template:
    | 'duplicates'
    | 'domainPileup'
    | 'neverWatched'
    | 'staleCategory'
    | 'windowSprawl';
};

export type DuplicateTier = 'exact' | 'canonical' | 'samePage';

export type DuplicateCluster = {
  id: string;
  tier: DuplicateTier;
  key: string;
  /** The tab we propose keeping, per the active keep-strategy. */
  keep: TabSnapshot;
  /** Tabs proposed for closing. Never includes protected tabs. */
  close: TabSnapshot[];
  /** Tabs in the cluster excluded from closing, with the reason why. */
  protectedTabs: { tab: TabSnapshot; reason: string }[];
};

export type KeepStrategy = 'newest' | 'oldest' | 'pinned';

export type CategoryCount = { category: Category; count: number };
