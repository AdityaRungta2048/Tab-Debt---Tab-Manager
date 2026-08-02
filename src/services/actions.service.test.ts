import { describe, it, expect, beforeEach } from 'vitest';
import { installMockChrome, type MockChrome } from '@/test/mocks/chrome';
import { toSnapshots } from '@/core/snapshot';
import type { TabSnapshot } from '@/types/tab';

let mock: MockChrome;
let svc: typeof import('./actions.service');

async function snaps(): Promise<TabSnapshot[]> {
  return toSnapshots(await mock.tabs.query({}), () => undefined, Date.now());
}

beforeEach(async () => {
  mock = installMockChrome(200);
  await mock.storage.local.clear();
  svc = await import('./actions.service');
});

describe('executeAction — close', () => {
  it('snapshots for undo BEFORE closing, so the tabs are still there to record', async () => {
    const all = await snaps();
    const targets = all.slice(0, 5);
    const result = await svc.executeAction({ kind: 'close', tabIds: targets.map((t) => t.id) }, all);

    expect(result.affected).toBe(5);
    expect(result.message).toBe('Closed 5 tabs');
    expect(result.undoId).not.toBeNull();

    const { undoHistory } = await import('./undo.service');
    const op = (await undoHistory()).find((o) => o.id === result.undoId)!;
    expect(op.tabs).toHaveLength(5);
    expect(op.tabs.map((t) => t.url).sort()).toEqual(targets.map((t) => t.url).sort());
  });

  it('reports in past tense, matching the verb on the button', async () => {
    const all = await snaps();
    const one = await svc.executeAction({ kind: 'close', tabIds: [all[0]!.id] }, all);
    expect(one.message).toBe('Closed 1 tab');
  });

  it('says so plainly when the tabs are already gone', async () => {
    const result = await svc.executeAction({ kind: 'close', tabIds: [999_999] }, await snaps());
    expect(result.affected).toBe(0);
    expect(result.message).toBe('Those tabs are already gone.');
    expect(result.undoId).toBeNull();
  });
});

/**
 * The safety property of bookmark-and-close: a tab whose bookmark failed must never be
 * closed. Losing a tab you asked to have saved is the worst outcome this product has.
 */
describe('executeAction — bookmarkAndClose', () => {
  it('saves to a dated Tab Debt folder, then closes', async () => {
    const all = await snaps();
    const targets = all.slice(0, 4);
    const before = (await mock.tabs.query({})).length;

    const result = await svc.executeAction(
      { kind: 'bookmarkAndClose', tabIds: targets.map((t) => t.id), folder: 'Development' },
      all,
    );

    expect(result.affected).toBe(4);
    expect(result.message).toContain('Tab Debt /');
    expect(result.message).toContain('Development');
    expect((await mock.tabs.query({})).length).toBe(before - 4);

    const bookmarked = (mock.bookmarks.__all() as { url?: string }[]).filter((b) => b.url);
    expect(bookmarked).toHaveLength(4);
  });

  it('closes NOTHING when a bookmark fails, and says the tabs are untouched', async () => {
    const all = await snaps();
    const targets = all.slice(0, 4);
    const before = (await mock.tabs.query({})).length;

    // Make the third bookmark write fail.
    const realCreate = mock.bookmarks.create;
    let calls = 0;
    mock.bookmarks.create = async (b) => {
      calls += 1;
      if (calls === 5) throw new Error('Bookmark quota exceeded');
      return realCreate(b);
    };

    const result = await svc.executeAction(
      { kind: 'bookmarkAndClose', tabIds: targets.map((t) => t.id), folder: 'Work' },
      all,
    );

    expect(result.affected).toBe(0);
    expect(result.warning).toContain('nothing was closed');
    expect(result.warning).toContain('untouched');
    expect((await mock.tabs.query({})).length, 'tabs were closed despite a failed save').toBe(before);
  });
});

describe('executeAction — non-destructive actions', () => {
  it('groups tabs and names the group', async () => {
    const all = await snaps();
    const targets = all.filter((t) => t.windowId === all[0]!.windowId).slice(0, 5);
    const result = await svc.executeAction(
      { kind: 'group', tabIds: targets.map((t) => t.id), title: 'GitHub' },
      all,
    );
    expect(result.message).toContain('"GitHub"');
    const after = await mock.tabs.query({});
    const grouped = after.filter((t) => targets.some((x) => x.id === t.id));
    expect(grouped.every((t) => t.groupId >= 0)).toBe(true);
  });

  it('warns when a selection spans windows, because Chrome cannot group across them', async () => {
    const all = await snaps();
    const windows = [...new Set(all.map((t) => t.windowId))];
    expect(windows.length).toBeGreaterThan(1);
    const spanning = windows.map((w) => all.find((t) => t.windowId === w)!);
    const result = await svc.executeAction(
      { kind: 'group', tabIds: spanning.map((t) => t.id), title: 'Mixed' },
      all,
    );
    expect(result.warning).toContain('one per window');
  });

  it('archives metadata then closes', async () => {
    const all = await snaps();
    const targets = all.slice(0, 3);
    const result = await svc.executeAction({ kind: 'archive', tabIds: targets.map((t) => t.id) }, all);
    expect(result.affected).toBe(3);
    const { read } = await import('./storage.service');
    expect((await read.archive()).tabs).toHaveLength(3);
  });

  it('pins and mutes', async () => {
    const all = await snaps();
    const unpinned = all.filter((t) => !t.pinned).slice(0, 3);
    await svc.executeAction({ kind: 'pin', tabIds: unpinned.map((t) => t.id) }, all);
    const after = await mock.tabs.query({});
    expect(unpinned.every((t) => after.find((a) => a.id === t.id)?.pinned)).toBe(true);

    const audible = all.filter((t) => !t.muted).slice(0, 2);
    await svc.executeAction({ kind: 'mute', tabIds: audible.map((t) => t.id) }, all);
    const after2 = await mock.tabs.query({});
    expect(audible.every((t) => after2.find((a) => a.id === t.id)?.mutedInfo.muted)).toBe(true);
  });
});

describe('isDestructive', () => {
  it.each([
    [{ kind: 'close' as const, tabIds: [] }, true],
    [{ kind: 'bookmarkAndClose' as const, tabIds: [], folder: 'x' }, true],
    [{ kind: 'archive' as const, tabIds: [] }, true],
    [{ kind: 'group' as const, tabIds: [], title: 'x' }, false],
    [{ kind: 'pin' as const, tabIds: [] }, false],
    [{ kind: 'mute' as const, tabIds: [] }, false],
  ])('classifies %o', (action, expected) => {
    expect(svc.isDestructive(action)).toBe(expected);
  });
});
