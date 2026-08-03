import type { StalenessBucket, TabSnapshot } from '@/types/tab';

const DAY = 86_400_000;

/**
 * Bucket edges, in ms of age. The brief names six buckets but not their edges; these tile
 * the whole line with no gaps and no overlaps (see DECISIONS.md D-004). Labels state the
 * real range rather than a rounded name, because "3 days" for a five-day-old tab is a
 * small lie and this product's entire value is being trusted about ages.
 */
export const BUCKETS: { id: StalenessBucket; label: string; maxAge: number }[] = [
  { id: 'today', label: 'Today', maxAge: DAY },
  { id: 'yesterday', label: 'Yesterday', maxAge: 2 * DAY },
  { id: '3days', label: '2–6 days', maxAge: 7 * DAY },
  { id: '7days', label: '1–4 weeks', maxAge: 30 * DAY },
  { id: '30days', label: '30+ days', maxAge: Infinity },
];

export const BUCKET_ORDER: StalenessBucket[] = [
  'never',
  '30days',
  '7days',
  '3days',
  'yesterday',
  'today',
];

export function bucketLabel(id: StalenessBucket): string {
  if (id === 'never') return 'Never opened';
  return BUCKETS.find((b) => b.id === id)?.label ?? id;
}

/**
 * Lower bound is inclusive, upper bound exclusive: a tab aged exactly 24h is "Yesterday",
 * not "Today". Ties must fall the same way every time or the counts flicker.
 */
export function bucketFor(tab: Pick<TabSnapshot, 'lastActiveAt'>, now: number): StalenessBucket {
  if (tab.lastActiveAt === null) return 'never';
  const age = Math.max(0, now - tab.lastActiveAt);
  for (const b of BUCKETS) if (age < b.maxAge) return b.id;
  return '30days';
}

export function ageMs(tab: Pick<TabSnapshot, 'lastActiveAt'>, now: number): number | null {
  return tab.lastActiveAt === null ? null : Math.max(0, now - tab.lastActiveAt);
}

/**
 * Human age. `inferred` records get an explicit qualifier — we backfilled those from
 * tabs.lastAccessed and cannot honestly claim to have watched them.
 */
export function formatAge(tab: Pick<TabSnapshot, 'lastActiveAt' | 'lastActiveInferred'>, now: number): string {
  const age = ageMs(tab, now);
  if (age === null) return 'Never opened';
  const base = formatDuration(age);
  return tab.lastActiveInferred ? `${base} (estimated)` : base;
}

/**
 * Compact form for the register, where this string appears 800 times in an 80px column.
 *
 * On first run EVERY record is inferred, so spelling out "(estimated)" per row wrapped the
 * cell and broke the 28px rhythm the whole design rests on — the caveat stopped reading as
 * honesty and started reading as noise. A leading `~` carries the same meaning in one
 * character; the column header and a per-cell tooltip carry the full explanation, and
 * screen readers still receive the word in full.
 */
export function formatAgeCompact(
  tab: Pick<TabSnapshot, 'lastActiveAt' | 'lastActiveInferred'>,
  now: number,
): string {
  const age = ageMs(tab, now);
  if (age === null) return 'Never opened';
  const base = formatDuration(age);
  return tab.lastActiveInferred ? `~${base}` : base;
}

export function formatDuration(ms: number): string {
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return months < 12 ? `${months}mo ago` : `${Math.floor(months / 12)}y ago`;
}

export type StalenessSummary = {
  counts: Record<StalenessBucket, number>;
  /** Share of tabs untouched for 7+ days, 0-1. Feeds the debt score. */
  staleShare7d: number;
  /** Share untouched for 30+ days, 0-1. */
  staleShare30d: number;
  neverOpened: number;
  oldestAge: number | null;
};

export function summarise(tabs: TabSnapshot[], now: number): StalenessSummary {
  const counts: Record<StalenessBucket, number> = {
    never: 0,
    today: 0,
    yesterday: 0,
    '3days': 0,
    '7days': 0,
    '30days': 0,
  };
  let oldest: number | null = null;
  for (const t of tabs) {
    counts[bucketFor(t, now)] += 1;
    const age = ageMs(t, now);
    if (age !== null && (oldest === null || age > oldest)) oldest = age;
  }
  const total = Math.max(1, tabs.length);
  // "Never opened" counts as stale on both horizons: a tab you never looked at is the
  // strongest possible staleness signal, not an absence of one.
  const stale7 = counts['7days'] + counts['30days'] + counts.never;
  const stale30 = counts['30days'] + counts.never;
  return {
    counts,
    staleShare7d: stale7 / total,
    staleShare30d: stale30 / total,
    neverOpened: counts.never,
    oldestAge: oldest,
  };
}
