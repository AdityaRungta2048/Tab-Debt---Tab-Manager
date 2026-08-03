import { describe, it, expect } from 'vitest';
import { bucketFor, summarise, formatAge, formatAgeCompact, formatDuration, bucketLabel, BUCKET_ORDER } from './buckets';
import type { TabSnapshot } from '@/types/tab';

const DAY = 86_400_000;
const SEC = 1000;
const NOW = Date.UTC(2026, 6, 15, 12, 0, 0);

const tab = (lastActiveAt: number | null, inferred = false): TabSnapshot => ({
  id: 1, url: 'https://example.com/', title: 'x', domain: 'example.com',
  windowId: 1, index: 0, groupId: -1, pinned: false, audible: false, muted: false,
  discarded: false, active: false, lastActiveAt, lastActiveInferred: inferred, createdAt: 0,
});

/** Boundaries are asserted exactly on the edge and one second either side. */
describe('bucketFor — boundaries', () => {
  const cases: [label: string, age: number, expected: string][] = [
    ['zero age', 0, 'today'],
    ['1s before 1d', DAY - SEC, 'today'],
    ['exactly 1d', DAY, 'yesterday'],
    ['1s after 1d', DAY + SEC, 'yesterday'],
    ['1s before 2d', 2 * DAY - SEC, 'yesterday'],
    ['exactly 2d', 2 * DAY, '3days'],
    ['1s after 2d', 2 * DAY + SEC, '3days'],
    ['1s before 7d', 7 * DAY - SEC, '3days'],
    ['exactly 7d', 7 * DAY, '7days'],
    ['1s after 7d', 7 * DAY + SEC, '7days'],
    ['1s before 30d', 30 * DAY - SEC, '7days'],
    ['exactly 30d', 30 * DAY, '30days'],
    ['1s after 30d', 30 * DAY + SEC, '30days'],
    ['90d', 90 * DAY, '30days'],
  ];

  it.each(cases)('%s -> %s', (_label, age, expected) => {
    expect(bucketFor(tab(NOW - age), NOW)).toBe(expected);
  });

  it('treats a null lastActiveAt as never opened, not as age zero', () => {
    expect(bucketFor(tab(null), NOW)).toBe('never');
  });

  it('clamps a future timestamp to today rather than producing a negative age', () => {
    expect(bucketFor(tab(NOW + 10 * DAY), NOW)).toBe('today');
  });

  it('tiles the whole line: every age lands in exactly one bucket', () => {
    for (let d = 0; d < 400; d++) {
      const b = bucketFor(tab(NOW - d * DAY - 1), NOW);
      expect(BUCKET_ORDER).toContain(b);
    }
  });
});

describe('summarise', () => {
  it('counts each bucket and computes stale shares', () => {
    const tabs = [
      tab(NOW),                    // today
      tab(NOW - DAY),              // yesterday
      tab(NOW - 3 * DAY),          // 3days
      tab(NOW - 10 * DAY),         // 7days
      tab(NOW - 40 * DAY),         // 30days
      tab(null),                   // never
    ];
    const s = summarise(tabs, NOW);
    expect(s.counts).toEqual({ today: 1, yesterday: 1, '3days': 1, '7days': 1, '30days': 1, never: 1 });
    // 7days + 30days + never = 3 of 6
    expect(s.staleShare7d).toBeCloseTo(0.5);
    // 30days + never = 2 of 6
    expect(s.staleShare30d).toBeCloseTo(1 / 3);
    expect(s.neverOpened).toBe(1);
    expect(s.oldestAge).toBe(40 * DAY);
  });

  it('does not divide by zero on an empty set', () => {
    const s = summarise([], NOW);
    expect(s.staleShare7d).toBe(0);
    expect(s.oldestAge).toBeNull();
  });
});

describe('formatAge — honesty about inferred records', () => {
  it('never presents an inferred age as observed fact', () => {
    expect(formatAge(tab(NOW - 37 * DAY, true), NOW)).toBe('1mo ago (estimated)');
    expect(formatAge(tab(NOW - 37 * DAY, false), NOW)).toBe('1mo ago');
  });

  it('labels a never-opened tab without any age claim', () => {
    expect(formatAge(tab(null, true), NOW)).toBe('Never opened');
  });
});

describe('formatDuration', () => {
  it.each([
    [30 * SEC, 'Just now'],
    [5 * 60_000, '5m ago'],
    [3 * 3_600_000, '3h ago'],
    [5 * DAY, '5d ago'],
    [45 * DAY, '1mo ago'],
    [400 * DAY, '1y ago'],
  ])('%i ms -> %s', (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });
});

describe('bucketLabel', () => {
  it('labels the real range rather than a rounded name', () => {
    expect(bucketLabel('never')).toBe('Never opened');
    expect(bucketLabel('3days')).toBe('2–6 days');
    expect(bucketLabel('7days')).toBe('1–4 weeks');
    expect(bucketLabel('30days')).toBe('30+ days');
  });
});

/**
 * Regression for CRITIQUE #2: on first run every record is inferred, so spelling out
 * "(estimated)" per row wrapped the register cell and broke the 28px rhythm.
 */
describe('formatAgeCompact', () => {
  it('marks an inferred age with a leading ~ instead of a parenthetical', () => {
    expect(formatAgeCompact(tab(NOW - 37 * DAY, true), NOW)).toBe('~1mo ago');
  });

  it('leaves an observed age unmarked', () => {
    expect(formatAgeCompact(tab(NOW - 37 * DAY, false), NOW)).toBe('1mo ago');
  });

  it('never claims an age for a never-opened tab', () => {
    expect(formatAgeCompact(tab(null, true), NOW)).toBe('Never opened');
  });

  it('stays short enough not to wrap an 80px column', () => {
    for (const age of [0, DAY, 5 * DAY, 45 * DAY, 400 * DAY]) {
      expect(formatAgeCompact(tab(NOW - age, true), NOW).length).toBeLessThanOrEqual(10);
    }
  });

  it('still conveys uncertainty: the full form remains available for tooltips and labels', () => {
    const t = tab(NOW - 37 * DAY, true);
    expect(formatAge(t, NOW)).toContain('(estimated)');
    expect(formatAgeCompact(t, NOW)).not.toContain('(estimated)');
  });
});
