import { describe, it, expect, beforeEach } from 'vitest';
import { installMockChrome, type MockChrome } from '@/test/mocks/chrome';
import { toSnapshots } from '@/core/snapshot';
import type { TabSnapshot } from '@/types/tab';

let mock: MockChrome;
// Imported dynamically: these modules touch `chrome` at call time, so the mock must be
// installed on globalThis before they run.
let undoSvc: typeof import('./undo.service');
let tabsSvc: typeof import('./tabs.service');

async function snapshotOf(ids?: number[]): Promise<TabSnapshot[]> {
  const raw = await mock.tabs.query({});
  const all = toSnapshots(raw, () => undefined, Date.now());
  return ids ? all.filter((t) => ids.includes(t.id)) : all;
}

beforeEach(async () => {
  mock = installMockChrome(400);
  undoSvc = await import('./undo.service');
  tabsSvc = await import('./tabs.service');
  await mock.storage.local.clear();
});

/**
 * THE test. Undo is the entire trust proposition: if a user cannot get 100 tabs back,
 * nothing else in this product matters. Automated, not a manual check.
 */
describe('undo — 100-tab round trip', () => {
  it('restores URL set, pinned state, window assignment and group membership', async () => {
    const before = await snapshotOf();
    const victims = before.slice(0, 100);
    expect(victims).toHaveLength(100);

    // The fixture must actually exercise the interesting paths, or this test proves nothing.
    expect(victims.some((t) => t.pinned), 'no pinned tab in the sample').toBe(true);
    expect(new Set(victims.map((t) => t.windowId)).size, 'sample spans one window').toBeGreaterThan(1);
    expect(victims.some((t) => t.groupId >= 0), 'no grouped tab in the sample').toBe(true);

    const undoId = await undoSvc.pushUndo('close', 'Closed 100 tabs', victims);
    await tabsSvc.closeTabs(victims.map((t) => t.id));

    expect((await mock.tabs.query({})).length).toBe(before.length - 100);

    const result = await undoSvc.undoOperation(undoId);
    expect(result.restored).toBe(100);
    expect(result.failed).toBe(0);

    const after = await snapshotOf();
    expect(after.length).toBe(before.length);

    // URL multiset: duplicates in the fixture mean a Set comparison would pass falsely.
    const bag = (tabs: TabSnapshot[]): string[] => tabs.map((t) => t.url).sort();
    expect(bag(after)).toEqual(bag(before));

    // Pinned state, per URL.
    const pinnedUrls = (tabs: TabSnapshot[]): string[] =>
      tabs.filter((t) => t.pinned).map((t) => t.url).sort();
    expect(pinnedUrls(after)).toEqual(pinnedUrls(before));

    // Window assignment, per URL.
    const windowOf = (tabs: TabSnapshot[]): string[] =>
      tabs.map((t) => `${t.url}@${t.windowId}`).sort();
    expect(windowOf(after)).toEqual(windowOf(before));

    // Group membership: every tab that was grouped is grouped again, and tabs that shared
    // a group still share one (the group id is necessarily new).
    const restoredUrls = new Set(victims.filter((t) => t.groupId >= 0).map((t) => t.url));
    const regrouped = after.filter((t) => restoredUrls.has(t.url) && t.groupId >= 0);
    expect(regrouped.length).toBeGreaterThanOrEqual(restoredUrls.size);

    const originalGroups = new Map<number, string[]>();
    for (const t of victims) {
      if (t.groupId < 0) continue;
      originalGroups.set(t.groupId, [...(originalGroups.get(t.groupId) ?? []), t.url]);
    }
    for (const urls of originalGroups.values()) {
      const groupIds = new Set(
        after.filter((t) => urls.includes(t.url) && t.groupId >= 0).map((t) => t.groupId),
      );
      expect(groupIds.size, 'tabs that shared a group were scattered').toBeLessThanOrEqual(1);
    }
  });

  it('restores muted state', async () => {
    const all = await snapshotOf();
    const muted = all.filter((t) => t.muted).slice(0, 3);
    expect(muted.length).toBeGreaterThan(0);
    const undoId = await undoSvc.pushUndo('close', 'x', muted);
    await tabsSvc.closeTabs(muted.map((t) => t.id));
    await undoSvc.undoOperation(undoId);
    const after = await snapshotOf();
    for (const t of muted) {
      expect(after.find((a) => a.url === t.url && a.muted), `${t.url} came back unmuted`).toBeTruthy();
    }
  });

  it('never steals focus while restoring', async () => {
    const victims = (await snapshotOf()).slice(0, 20);
    const undoId = await undoSvc.pushUndo('close', 'x', victims);
    await tabsSvc.closeTabs(victims.map((t) => t.id));
    await undoSvc.undoOperation(undoId);
    const created = mock.__tabs().filter((t) => victims.some((v) => v.url === t.url));
    expect(created.every((t) => !t.active)).toBe(true);
  });
});

describe('undo — resilience', () => {
  it('relocates tabs whose original window is gone, and says how many', async () => {
    const all = await snapshotOf();
    const windowIds = [...new Set(all.map((t) => t.windowId))];
    const doomed = windowIds[windowIds.length - 1]!;
    const victims = all.filter((t) => t.windowId === doomed).slice(0, 10);

    const undoId = await undoSvc.pushUndo('close', 'x', victims);
    // Close every tab in that window, so the window itself no longer exists.
    await tabsSvc.closeTabs(all.filter((t) => t.windowId === doomed).map((t) => t.id));

    const result = await undoSvc.undoOperation(undoId);
    expect(result.restored).toBe(victims.length);
    expect(result.relocated).toBe(victims.length);
  });

  it('is idempotent: undoing twice does not duplicate tabs', async () => {
    const victims = (await snapshotOf()).slice(0, 10);
    const undoId = await undoSvc.pushUndo('close', 'x', victims);
    await tabsSvc.closeTabs(victims.map((t) => t.id));

    await undoSvc.undoOperation(undoId);
    const afterFirst = (await mock.tabs.query({})).length;
    const second = await undoSvc.undoOperation(undoId);

    expect(second.restored).toBe(0);
    expect((await mock.tabs.query({})).length).toBe(afterFirst);
  });

  it('returns nothing for an unknown operation id rather than throwing', async () => {
    expect(await undoSvc.undoOperation('does-not-exist')).toEqual({ restored: 0, failed: 0, relocated: 0 });
  });
});

describe('undo — the history stack', () => {
  it('keeps the last 10 operations, newest first', async () => {
    for (let i = 0; i < 14; i++) {
      await undoSvc.pushUndo('close', `op ${i}`, (await snapshotOf()).slice(0, 2));
    }
    const history = await undoSvc.undoHistory();
    expect(history).toHaveLength(undoSvc.MAX_OPS);
    expect(history[0]!.label).toBe('op 13');
    expect(history[history.length - 1]!.label).toBe('op 4');
  });

  it('stays inside its byte budget even after a huge operation', async () => {
    const all = await snapshotOf();
    for (let i = 0; i < 12; i++) await undoSvc.pushUndo('close', `big ${i}`, all);
    const history = await undoSvc.undoHistory();
    const bytes = new TextEncoder().encode(JSON.stringify(history)).length;
    expect(bytes).toBeLessThanOrEqual(undoSvc.MAX_UNDO_BYTES);
    expect(history.length).toBeGreaterThanOrEqual(1);
  });

  it('captures group titles before the tabs are destroyed', async () => {
    const grouped = (await snapshotOf()).filter((t) => t.groupId === 900).slice(0, 3);
    const undoId = await undoSvc.pushUndo('close', 'x', grouped);
    const op = (await undoSvc.undoHistory()).find((o) => o.id === undoId)!;
    expect(op.groupTitles['900']).toBe('GitHub');
  });

  it('marks an operation undone so the history reflects reality', async () => {
    const victims = (await snapshotOf()).slice(0, 3);
    const undoId = await undoSvc.pushUndo('close', 'x', victims);
    await tabsSvc.closeTabs(victims.map((t) => t.id));
    await undoSvc.undoOperation(undoId);
    expect((await undoSvc.undoHistory()).find((o) => o.id === undoId)!.undone).toBe(true);
  });

  it('clears on request', async () => {
    await undoSvc.pushUndo('close', 'x', (await snapshotOf()).slice(0, 2));
    await undoSvc.clearUndoHistory();
    expect(await undoSvc.undoHistory()).toEqual([]);
  });

  it('states plainly what it cannot bring back', () => {
    expect(undoSvc.UNDO_CANNOT_RESTORE).toMatch(/scroll/i);
    expect(undoSvc.UNDO_CANNOT_RESTORE).toMatch(/form/i);
    expect(undoSvc.UNDO_CANNOT_RESTORE).toMatch(/history/i);
  });
});
