import type { TabSnapshot } from '@/types/tab';
import { hashString, parseUrl } from './url';

/**
 * Conversion from a Chrome-shaped tab record into the plain `TabSnapshot` that core/
 * works in. Pure and Chrome-free — it takes the *shape* Chrome hands us, never the API.
 * Living here rather than in services/ means the fixture exercises the real conversion.
 */
export type RawTab = {
  id?: number | undefined;
  url?: string | undefined;
  pendingUrl?: string | undefined;
  title?: string | undefined;
  windowId?: number | undefined;
  index?: number | undefined;
  groupId?: number | undefined;
  pinned?: boolean | undefined;
  audible?: boolean | undefined;
  mutedInfo?: { muted?: boolean | undefined } | undefined;
  discarded?: boolean | undefined;
  active?: boolean | undefined;
  lastAccessed?: number | undefined;
};

export type ActivityRecord = { lastActiveAt: number | null; inferred: boolean };
export type ActivityLookup = (key: string) => ActivityRecord | undefined;

/**
 * Activity is keyed by tab id AND a hash of the URL. Chrome reuses tab ids freely across
 * restarts, so the id alone would happily hand one tab's history to an unrelated one.
 */
export function activityKey(tabId: number, url: string): string {
  return `${tabId}:${hashString(url)}`;
}

export function toSnapshot(raw: RawTab, lookup: ActivityLookup, now: number): TabSnapshot {
  const id = raw.id ?? -1;
  const url = raw.url || raw.pendingUrl || '';
  const parsed = parseUrl(url);
  const record = lookup(activityKey(id, url));

  // Precedence: what we observed ourselves > what Chrome's lastAccessed implies > never.
  let lastActiveAt: number | null;
  let lastActiveInferred: boolean;
  if (record) {
    lastActiveAt = record.lastActiveAt;
    lastActiveInferred = record.inferred;
  } else if (typeof raw.lastAccessed === 'number') {
    // A tab that predates our install. We did not watch it, so we say so.
    lastActiveAt = raw.lastAccessed;
    lastActiveInferred = true;
  } else {
    lastActiveAt = null;
    lastActiveInferred = false;
  }

  // An active tab is being looked at right now, whatever any stored record says.
  if (raw.active) {
    lastActiveAt = now;
    lastActiveInferred = false;
  }

  return {
    id,
    url,
    title: raw.title ?? '',
    // Deliberately empty for non-http schemes: `chrome://settings/` has host "settings",
    // and letting that through would invent a domain pileup for a browser page.
    domain: parsed.domain,
    windowId: raw.windowId ?? -1,
    index: raw.index ?? 0,
    groupId: raw.groupId ?? -1,
    pinned: raw.pinned ?? false,
    audible: raw.audible ?? false,
    muted: raw.mutedInfo?.muted ?? false,
    discarded: raw.discarded ?? false,
    active: raw.active ?? false,
    lastActiveAt,
    lastActiveInferred,
    createdAt: raw.lastAccessed ?? now,
  };
}

export function toSnapshots(raws: RawTab[], lookup: ActivityLookup, now: number): TabSnapshot[] {
  return raws.map((r) => toSnapshot(r, lookup, now));
}
