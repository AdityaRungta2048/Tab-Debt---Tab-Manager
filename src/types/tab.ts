/**
 * The unit `core/` operates on. Plain data, no Chrome types, no class instances —
 * that is what lets the whole domain run against a generated 800-tab fixture in Node.
 */
export type TabSnapshot = {
  id: number;
  url: string;
  title: string;
  /** Registrable-ish host, lowercased, `www.` stripped. Empty for `about:`/`chrome:`. */
  domain: string;
  windowId: number;
  index: number;
  /** -1 when ungrouped, matching chrome.tabGroups.TAB_GROUP_ID_NONE. */
  groupId: number;
  pinned: boolean;
  audible: boolean;
  muted: boolean;
  discarded: boolean;
  active: boolean;
  /** ms epoch of last activation. `null` means never activated since we started watching. */
  lastActiveAt: number | null;
  /**
   * True when `lastActiveAt` was backfilled from `tabs.lastAccessed` rather than observed
   * by us. Propagates to the UI so we never render a confident "37 days" for a guess.
   */
  lastActiveInferred: boolean;
  createdAt: number;
};

export const CATEGORIES = [
  'Development',
  'Work',
  'Learning',
  'Entertainment',
  'Shopping',
  'Finance',
  'Social',
  'News',
  'AI',
  'Travel',
  'Reading Later',
  'Other',
] as const;

export type Category = (typeof CATEGORIES)[number];

/** Which rule tier produced a categorisation — powers the "why this category" affordance. */
export type RuleTier = 'override' | 'domain' | 'path' | 'keyword' | 'fallback';

export type Categorization = {
  category: Category;
  tier: RuleTier;
  /** Human-readable explanation of the exact rule that fired. */
  reason: string;
  confidence: number;
};

export type StalenessBucket =
  | 'never'
  | 'today'
  | 'yesterday'
  | '3days'
  | '7days'
  | '30days';

/** The only input to the debt score. A pure snapshot makes the score unit-testable. */
export type DebtInput = {
  tabs: TabSnapshot[];
  windowCount: number;
  now: number;
  baseline: number;
};
