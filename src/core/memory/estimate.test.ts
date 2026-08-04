import { describe, it, expect } from 'vitest';
import { estimateTabMb, estimateTotalMb, formatMb, formatMbBare, DEFAULT_WEIGHTS } from './estimate';
import type { TabSnapshot } from '@/types/tab';

let seq = 0;
const t = (over: Partial<TabSnapshot> = {}): TabSnapshot => ({
  id: ++seq, url: 'https://example.com/', title: 'x', domain: 'example.com', windowId: 1,
  index: 0, groupId: -1, pinned: false, audible: false, muted: false, discarded: false,
  active: false, lastActiveAt: 0, lastActiveInferred: false, createdAt: 0, ...over,
});

describe('estimateTabMb', () => {
  it('uses the base weight for an ordinary tab', () => {
    expect(estimateTabMb(t())).toBe(DEFAULT_WEIGHTS.base);
  });

  it('weighs a discarded tab at near zero, whatever the domain', () => {
    expect(estimateTabMb(t({ url: 'https://youtube.com/watch?v=1', discarded: true }))).toBe(
      DEFAULT_WEIGHTS.discarded,
    );
  });

  it.each([
    ['https://www.youtube.com/watch?v=1', 5],
    ['https://www.figma.com/file/a/b', 6],
    ['https://docs.google.com/document/d/a/edit', 3.5],
    ['https://meet.google.com/abc', 6],
  ])('applies the heavy-domain multiplier for %s', (url, multiplier) => {
    expect(estimateTabMb(t({ url }))).toBe(Math.round(DEFAULT_WEIGHTS.base * multiplier));
  });

  it('treats an audible tab as heavy even on an unknown domain', () => {
    expect(estimateTabMb(t({ url: 'https://unknown.example/', audible: true }))).toBe(
      DEFAULT_WEIGHTS.base * 3,
    );
  });

  it('charges internal pages a fraction of a real tab', () => {
    expect(estimateTabMb(t({ url: 'about:blank' }))).toBeLessThan(DEFAULT_WEIGHTS.base);
    expect(estimateTabMb(t({ url: 'chrome://settings/' }))).toBeLessThan(DEFAULT_WEIGHTS.base);
  });

  it('honours caller-supplied weights, because the table is user-editable', () => {
    const weights = { base: 10, discarded: 1, heavy: { 'example.com': 2 } };
    expect(estimateTabMb(t(), weights)).toBe(20);
  });

  it('totals a set', () => {
    expect(estimateTotalMb([t(), t()])).toBe(DEFAULT_WEIGHTS.base * 2);
    expect(estimateTotalMb([])).toBe(0);
  });
});

/**
 * The honesty guarantee. There is no per-tab memory API in Chrome, so every one of these
 * numbers is a guess — and a guess rendered without a qualifier is a lie.
 */
describe('formatMb — never states an estimate as fact', () => {
  it.each([0, 0.4, 1, 60, 500, 1023, 1024, 99999])('labels %i MB as estimated', (mb) => {
    expect(formatMb(mb)).toContain('(estimated)');
    expect(formatMb(mb)).toMatch(/^~/);
  });

  it('switches to GB above 1024 MB', () => {
    expect(formatMb(2048)).toBe('~2.0 GB (estimated)');
    expect(formatMb(512)).toBe('~512 MB (estimated)');
  });

  it('offers a bare form only for callers that supply their own label', () => {
    expect(formatMbBare(512)).toBe('512 MB');
    expect(formatMbBare(2048)).toBe('2.0 GB');
  });
});
