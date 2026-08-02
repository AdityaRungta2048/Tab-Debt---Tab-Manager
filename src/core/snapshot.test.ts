import { describe, it, expect } from 'vitest';
import { toSnapshot, toSnapshots, activityKey, type ActivityRecord } from './snapshot';

const NOW = Date.UTC(2026, 6, 15, 12, 0, 0);
const DAY = 86_400_000;
const none = () => undefined;

describe('toSnapshot — field mapping', () => {
  it('maps a fully-populated Chrome tab', () => {
    const s = toSnapshot(
      {
        id: 7, url: 'https://www.GitHub.com/a/b?x=1#f', title: 'Repo', windowId: 3, index: 4,
        groupId: 900, pinned: true, audible: true, mutedInfo: { muted: true }, discarded: true,
        active: false, lastAccessed: NOW - DAY,
      },
      none,
      NOW,
    );
    expect(s).toMatchObject({
      id: 7, domain: 'github.com', windowId: 3, index: 4, groupId: 900,
      pinned: true, audible: true, muted: true, discarded: true, active: false,
    });
  });

  it('fills sane defaults for a sparse tab rather than producing undefined', () => {
    const s = toSnapshot({}, none, NOW);
    expect(s).toMatchObject({ id: -1, url: '', title: '', domain: '', groupId: -1, pinned: false });
    expect(s.lastActiveAt).toBeNull();
  });

  it('falls back to pendingUrl for a tab still loading', () => {
    expect(toSnapshot({ pendingUrl: 'https://x.com/a' }, none, NOW).domain).toBe('x.com');
  });

  it('gives internal pages no domain, so they never join a domain pileup', () => {
    expect(toSnapshot({ url: 'chrome://settings/' }, none, NOW).domain).toBe('');
    expect(toSnapshot({ url: 'about:blank' }, none, NOW).domain).toBe('');
  });
});

/** The staleness-honesty guarantee: we never claim to have watched what we only inferred. */
describe('toSnapshot — inferred vs observed activity', () => {
  it('marks a pre-install tab as inferred when falling back to lastAccessed', () => {
    const s = toSnapshot({ id: 1, url: 'https://x.com/', lastAccessed: NOW - 37 * DAY }, none, NOW);
    expect(s.lastActiveAt).toBe(NOW - 37 * DAY);
    expect(s.lastActiveInferred).toBe(true);
  });

  it('prefers our own observed record over lastAccessed, and marks it observed', () => {
    const observed: ActivityRecord = { lastActiveAt: NOW - 2 * DAY, inferred: false };
    const lookup = (k: string): ActivityRecord | undefined =>
      k === activityKey(1, 'https://x.com/') ? observed : undefined;
    const s = toSnapshot({ id: 1, url: 'https://x.com/', lastAccessed: NOW - 37 * DAY }, lookup, NOW);
    expect(s.lastActiveAt).toBe(NOW - 2 * DAY);
    expect(s.lastActiveInferred).toBe(false);
  });

  it('respects a stored known-never-opened record over Chrome lastAccessed', () => {
    const lookup = (): ActivityRecord => ({ lastActiveAt: null, inferred: false });
    const s = toSnapshot({ id: 1, url: 'https://x.com/', lastAccessed: NOW - DAY }, lookup, NOW);
    expect(s.lastActiveAt).toBeNull();
  });

  it('treats a tab with no record and no lastAccessed as never opened', () => {
    const s = toSnapshot({ id: 1, url: 'https://x.com/' }, none, NOW);
    expect(s.lastActiveAt).toBeNull();
    expect(s.lastActiveInferred).toBe(false);
  });

  it('treats the active tab as active right now, whatever any record says', () => {
    const lookup = (): ActivityRecord => ({ lastActiveAt: NOW - 90 * DAY, inferred: true });
    const s = toSnapshot({ id: 1, url: 'https://x.com/', active: true }, lookup, NOW);
    expect(s.lastActiveAt).toBe(NOW);
    expect(s.lastActiveInferred).toBe(false);
  });
});

describe('activityKey', () => {
  it('separates two tabs that reuse the same id across restarts', () => {
    expect(activityKey(5, 'https://a.com/')).not.toBe(activityKey(5, 'https://b.com/'));
  });
  it('is stable for the same id and url', () => {
    expect(activityKey(5, 'https://a.com/')).toBe(activityKey(5, 'https://a.com/'));
  });
});

describe('toSnapshots', () => {
  it('converts a list preserving order', () => {
    const out = toSnapshots([{ id: 1, url: 'https://a.com/' }, { id: 2, url: 'https://b.com/' }], none, NOW);
    expect(out.map((s) => s.id)).toEqual([1, 2]);
  });
});
