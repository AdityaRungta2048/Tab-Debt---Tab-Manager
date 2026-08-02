import type { z } from 'zod';
import {
  KEYS,
  SCHEMA_VERSION,
  activitySchema,
  archiveSchema,
  dailySchema,
  sessionsSchema,
  settingsSchema,
  undoStackSchema,
  type ActivityState,
  type ArchiveState,
  type DailyState,
  type SessionsState,
  type Settings,
  type UndoStack,
} from '@/types/storage';

/**
 * The only module that reads or writes chrome.storage.
 *
 * Two rules hold everything together:
 *   1. Every read is Zod-validated. Stored shapes drift across versions, and an
 *      unvalidated read is how an extension bricks itself for its longest-standing user.
 *   2. Every write goes through `mutate`, which re-reads immediately before writing.
 *      The MV3 service worker can be killed between any two lines and woken concurrently,
 *      so read-modify-write with a stale in-memory copy silently loses data.
 */

async function readRaw(key: string): Promise<unknown> {
  const out = await chrome.storage.local.get(key);
  return (out as Record<string, unknown>)[key];
}

/**
 * Validate, or fall back to the schema's own defaults. A corrupt or older-shaped record
 * must degrade to a working empty state, never throw into a UI render.
 */
function parseOr<T>(schema: z.ZodType<T>, raw: unknown, fallback: () => T, key: string): T {
  if (raw === undefined) return fallback();
  const result = schema.safeParse(raw);
  if (result.success) return result.data;
  console.warn(`[tab-debt] ${key} failed validation, resetting to defaults`, result.error.issues);
  return fallback();
}

const defaults = {
  settings: (): Settings => settingsSchema.parse({ v: SCHEMA_VERSION }),
  activity: (): ActivityState => activitySchema.parse({ v: SCHEMA_VERSION }),
  undo: (): UndoStack => undoStackSchema.parse({ v: SCHEMA_VERSION }),
  archive: (): ArchiveState => archiveSchema.parse({ v: SCHEMA_VERSION }),
  daily: (): DailyState => dailySchema.parse({ v: SCHEMA_VERSION }),
  sessions: (): SessionsState => sessionsSchema.parse({ v: SCHEMA_VERSION }),
};

export const read = {
  settings: async (): Promise<Settings> =>
    parseOr(settingsSchema, await readRaw(KEYS.settings), defaults.settings, KEYS.settings),
  activity: async (): Promise<ActivityState> =>
    parseOr(activitySchema, await readRaw(KEYS.activity), defaults.activity, KEYS.activity),
  undo: async (): Promise<UndoStack> =>
    parseOr(undoStackSchema, await readRaw(KEYS.undo), defaults.undo, KEYS.undo),
  archive: async (): Promise<ArchiveState> =>
    parseOr(archiveSchema, await readRaw(KEYS.archive), defaults.archive, KEYS.archive),
  daily: async (): Promise<DailyState> =>
    parseOr(dailySchema, await readRaw(KEYS.daily), defaults.daily, KEYS.daily),
  sessions: async (): Promise<SessionsState> =>
    parseOr(sessionsSchema, await readRaw(KEYS.sessions), defaults.sessions, KEYS.sessions),
};

/**
 * Read-modify-write that re-reads first. Not a transaction — chrome.storage offers none —
 * but it closes the window where a worker restart between read and write clobbers a
 * concurrent update, which is the failure mode that actually happens in MV3.
 */
async function mutate<T>(
  key: string,
  reader: () => Promise<T>,
  fn: (current: T) => T,
): Promise<T> {
  const next = fn(await reader());
  await chrome.storage.local.set({ [key]: next });
  return next;
}

export const update = {
  settings: (fn: (s: Settings) => Settings): Promise<Settings> =>
    mutate(KEYS.settings, read.settings, fn),
  activity: (fn: (s: ActivityState) => ActivityState): Promise<ActivityState> =>
    mutate(KEYS.activity, read.activity, fn),
  undo: (fn: (s: UndoStack) => UndoStack): Promise<UndoStack> => mutate(KEYS.undo, read.undo, fn),
  archive: (fn: (s: ArchiveState) => ArchiveState): Promise<ArchiveState> =>
    mutate(KEYS.archive, read.archive, fn),
  daily: (fn: (s: DailyState) => DailyState): Promise<DailyState> =>
    mutate(KEYS.daily, read.daily, fn),
  sessions: (fn: (s: SessionsState) => SessionsState): Promise<SessionsState> =>
    mutate(KEYS.sessions, read.sessions, fn),
};

/** Everything, for the Settings export button. Local file, no network. */
export async function exportAll(): Promise<Record<string, unknown>> {
  return {
    exportedAt: new Date().toISOString(),
    schemaVersion: SCHEMA_VERSION,
    settings: await read.settings(),
    archive: await read.archive(),
    daily: await read.daily(),
    sessions: await read.sessions(),
  };
}

/** Full wipe, for the Settings "delete everything" button. */
export async function wipeAll(): Promise<void> {
  await chrome.storage.local.remove(Object.values(KEYS));
}

export async function bytesInUse(): Promise<number> {
  const api = chrome.storage.local as { getBytesInUse?: (k?: null) => Promise<number> };
  return api.getBytesInUse ? api.getBytesInUse(null) : 0;
}

/** storage.local is ~10MB. We warn well before that, in the Settings surface. */
export const STORAGE_QUOTA_BYTES = 10 * 1024 * 1024;
