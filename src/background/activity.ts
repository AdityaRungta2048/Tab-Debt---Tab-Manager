import { activityKey } from '@/core/snapshot';
import { read, update } from '@/services/storage.service';

/**
 * The `lastSeenActive` map.
 *
 * chrome.tabs.lastAccessed (Chrome 121+) is the seed, but it is unhelpful for tabs that
 * predate our install, so we keep our own record and mark anything we did not observe
 * ourselves as `inferred`.
 *
 * This module holds NO module-level state. The MV3 worker is killed aggressively, so
 * every handler is read-storage, compute, write-storage — a cached map here would be
 * silently empty half the time.
 */

const DAY = 86_400_000;
/** Records for tabs that no longer exist are pruned after this long. */
const RECORD_TTL = 30 * DAY;

/** Record that a tab was just looked at. Observed, therefore never inferred. */
export async function recordActivation(tabId: number, url: string): Promise<void> {
  const key = activityKey(tabId, url);
  await update.activity((state) => ({
    ...state,
    records: { ...state.records, [key]: { lastActiveAt: Date.now(), inferred: false, url } },
  }));
}

/**
 * Record that a tab was created but not activated. This is what makes "Never opened" a
 * real, observed fact rather than an inference — Chrome sets lastAccessed on creation, so
 * without this every new tab would look like it had been viewed.
 */
export async function recordCreation(tabId: number, url: string, active: boolean): Promise<void> {
  if (active) return recordActivation(tabId, url);
  const key = activityKey(tabId, url);
  await update.activity((state) =>
    state.records[key]
      ? state
      : { ...state, records: { ...state.records, [key]: { lastActiveAt: null, inferred: false, url } } },
  );
}

export async function forgetTab(tabId: number): Promise<void> {
  await update.activity((state) => {
    const prefix = `${tabId}:`;
    const records = Object.fromEntries(
      Object.entries(state.records).filter(([k]) => !k.startsWith(prefix)),
    );
    return { ...state, records };
  });
}

/**
 * One-time backfill from chrome.tabs.lastAccessed for tabs that existed before install.
 * Marked `inferred: true` so the UI never shows a confident "37 days" for a guess.
 */
export async function backfillOnce(): Promise<void> {
  const existing = await read.activity();
  if (existing.backfilledAt !== null) return;

  const tabs = await chrome.tabs.query({});
  const records: typeof existing.records = { ...existing.records };
  for (const tab of tabs) {
    const url = tab.url ?? tab.pendingUrl ?? '';
    if (tab.id === undefined || !url) continue;
    const key = activityKey(tab.id, url);
    if (records[key]) continue;
    records[key] = {
      lastActiveAt: typeof tab.lastAccessed === 'number' ? tab.lastAccessed : null,
      inferred: true,
      url,
    };
  }

  await update.activity((state) => ({ ...state, records, backfilledAt: Date.now() }));
}

/**
 * Drop records for tabs that no longer exist. Without this the map grows forever, and
 * an unbounded map in a ~10MB budget is a slow-motion bug.
 */
export async function pruneActivity(): Promise<number> {
  const tabs = await chrome.tabs.query({});
  const live = new Set<string>();
  for (const tab of tabs) {
    const url = tab.url ?? tab.pendingUrl ?? '';
    if (tab.id !== undefined && url) live.add(activityKey(tab.id, url));
  }

  const cutoff = Date.now() - RECORD_TTL;
  let removed = 0;
  await update.activity((state) => {
    const records = Object.fromEntries(
      Object.entries(state.records).filter(([key, record]) => {
        const keep = live.has(key) || (record.lastActiveAt ?? 0) > cutoff;
        if (!keep) removed += 1;
        return keep;
      }),
    );
    return { ...state, records };
  });
  return removed;
}
