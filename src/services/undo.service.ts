import type { TabSnapshot } from '@/types/tab';
import type { UndoOp, UndoTab } from '@/types/storage';
import { read, update } from './storage.service';
import { getGroups } from './tabs.service';

/**
 * Undo is the entire trust proposition. If a user cannot get 100 tabs back, nothing else
 * in this product matters.
 *
 * chrome.sessions.restore is deliberately not used: it is per-item and lossy, and cannot
 * do a 100-tab bulk undo. So we snapshot what we are about to destroy and rebuild it
 * ourselves via chrome.tabs.create, re-applying pinned state, window placement and group
 * membership on a best-effort basis.
 *
 * What undo CANNOT restore, and what the UI says plainly rather than discovering later:
 * scroll position, form state, and per-tab back/forward history.
 */

export const MAX_OPS = 10;
/** Undo history must never be the reason storage fills up. ~1MB of a ~10MB budget. */
export const MAX_UNDO_BYTES = 1_000_000;

export const UNDO_CANNOT_RESTORE = 'Scroll position, form contents and page history';

function toUndoTab(t: TabSnapshot): UndoTab {
  return {
    url: t.url,
    title: t.title,
    pinned: t.pinned,
    windowId: t.windowId,
    index: t.index,
    groupId: t.groupId,
    muted: t.muted,
    active: t.active,
  };
}

function byteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

/**
 * Record what is about to be destroyed. Called BEFORE the destructive action, always —
 * afterwards the tabs are gone and there is nothing left to snapshot.
 */
export async function pushUndo(
  kind: UndoOp['kind'],
  label: string,
  tabs: TabSnapshot[],
): Promise<string> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Capture group titles now: once the tabs close, an emptied group ceases to exist and
  // its name is unrecoverable.
  const groups = await getGroups().catch(() => new Map());
  const groupTitles: Record<string, string> = {};
  for (const t of tabs) {
    if (t.groupId >= 0) {
      const info = groups.get(t.groupId);
      if (info?.title) groupTitles[String(t.groupId)] = info.title;
    }
  }

  const op: UndoOp = {
    id,
    at: Date.now(),
    label,
    kind,
    tabs: tabs.map(toUndoTab),
    groupTitles,
    undone: false,
  };

  await update.undo((stack) => {
    let ops = [op, ...stack.ops].slice(0, MAX_OPS);
    // Trim oldest-first until the stack fits its byte budget, so one enormous operation
    // cannot evict the entire history or blow the quota.
    while (ops.length > 1 && byteLength(ops) > MAX_UNDO_BYTES) ops = ops.slice(0, -1);
    return { ...stack, ops };
  });

  return id;
}

export type UndoResult = {
  restored: number;
  failed: number;
  /** Tabs put back in a different window because the original no longer exists. */
  relocated: number;
};

/**
 * Rebuild the tabs of an operation. Best-effort by design: a window may have been closed
 * since, and refusing to restore anything because one target is missing would be worse
 * than restoring 99 of 100 and saying so.
 */
export async function undoOperation(opId: string): Promise<UndoResult> {
  const stack = await read.undo();
  const op = stack.ops.find((o) => o.id === opId);
  if (!op || op.undone) return { restored: 0, failed: 0, relocated: 0 };

  const liveWindows = new Set((await chrome.windows.getAll({})).map((w) => w.id));
  const result: UndoResult = { restored: 0, failed: 0, relocated: 0 };

  // Original groupId -> the new group we rebuild for it.
  const rebuiltGroups = new Map<number, number[]>();

  // Ascending index so tabs land back in their original left-to-right order.
  for (const t of [...op.tabs].sort((a, b) => a.index - b.index)) {
    const targetWindow = liveWindows.has(t.windowId) ? t.windowId : undefined;
    if (targetWindow === undefined) result.relocated += 1;
    try {
      const created = await chrome.tabs.create({
        url: t.url,
        pinned: t.pinned,
        index: t.index,
        active: false, // never steal focus while restoring 100 tabs
        ...(targetWindow !== undefined ? { windowId: targetWindow } : {}),
      });
      result.restored += 1;

      if (t.muted && created.id !== undefined) {
        await chrome.tabs.update(created.id, { muted: true }).catch(() => undefined);
      }
      if (t.groupId >= 0 && created.id !== undefined) {
        const list = rebuiltGroups.get(t.groupId);
        if (list) list.push(created.id);
        else rebuiltGroups.set(t.groupId, [created.id]);
      }
    } catch {
      result.failed += 1;
    }
  }

  // Re-form the groups, restoring their original names where we captured them.
  for (const [originalGroupId, tabIds] of rebuiltGroups) {
    try {
      const groupId = await chrome.tabs.group({ tabIds });
      const title = op.groupTitles[String(originalGroupId)];
      if (title) await chrome.tabGroups.update(groupId, { title });
    } catch {
      // Grouping is a nicety; the tabs themselves are already back.
    }
  }

  await update.undo((s) => ({
    ...s,
    ops: s.ops.map((o) => (o.id === opId ? { ...o, undone: true } : o)),
  }));

  return result;
}

/** The history panel, because people notice their mistake two minutes later, not two seconds. */
export async function undoHistory(): Promise<UndoOp[]> {
  return (await read.undo()).ops;
}

export async function clearUndoHistory(): Promise<void> {
  await update.undo((s) => ({ ...s, ops: [] }));
}
