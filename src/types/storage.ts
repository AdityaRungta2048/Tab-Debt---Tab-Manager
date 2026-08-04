import { z } from 'zod';
import { CATEGORIES } from './tab';

/**
 * Every shape that crosses the chrome.storage boundary is validated here. Stored shapes
 * drift across versions, and an unvalidated read is how an extension bricks itself for a
 * user who has been on it since v1. Each schema carries `v` and has a migration path.
 */

export const SCHEMA_VERSION = 1;

export const KEYS = {
  settings: 'td.settings.v1',
  activity: 'td.activity.v1',
  undo: 'td.undo.v1',
  archive: 'td.archive.v1',
  daily: 'td.daily.v1',
  sessions: 'td.sessions.v1',
} as const;

export const categorySchema = z.enum(CATEGORIES);

export const settingsSchema = z.object({
  v: z.literal(SCHEMA_VERSION),
  /** "Comfortable" tab count. The score measures debt relative to this, not to zero. */
  baseline: z.number().int().min(1).max(500).default(25),
  theme: z.enum(['system', 'light', 'dark']).default('system'),
  /** domain -> category. A manual recategorisation wins forever (rule tier 1). */
  overrides: z.record(z.string(), categorySchema).default({}),
  /** Editable in settings, because the canonical-duplicate tier depends on it. */
  trackingParams: z.array(z.string()).default([]),
  /** The memory heuristic, exposed rather than hidden — see DECISIONS.md D-002. */
  memoryWeights: z
    .object({
      base: z.number().default(60),
      discarded: z.number().default(3),
      heavy: z.record(z.string(), z.number()).default({}),
    })
    .default({ base: 60, discarded: 3, heavy: {} }),
  keepStrategy: z.enum(['newest', 'oldest', 'pinned']).default('newest'),
  onboarded: z.boolean().default(false),
});
export type Settings = z.infer<typeof settingsSchema>;

export const activityRecordSchema = z.object({
  // Nullable: a tab we watched get created but never activated is a *known* never-opened,
  // which is different from a tab we have no record of at all.
  lastActiveAt: z.number().nullable(),
  inferred: z.boolean(),
  url: z.string(),
});
export const activitySchema = z.object({
  v: z.literal(SCHEMA_VERSION),
  /** Keyed by `${tabId}:${djb2(url)}` — tab ids alone are reused across restarts. */
  records: z.record(z.string(), activityRecordSchema).default({}),
  backfilledAt: z.number().nullable().default(null),
});
export type ActivityState = z.infer<typeof activitySchema>;

/** What we snapshot before a destructive action. Enough to rebuild placement. */
export const undoTabSchema = z.object({
  url: z.string(),
  title: z.string(),
  pinned: z.boolean(),
  windowId: z.number(),
  index: z.number(),
  groupId: z.number(),
  muted: z.boolean(),
  active: z.boolean(),
});
export type UndoTab = z.infer<typeof undoTabSchema>;

export const undoOpSchema = z.object({
  id: z.string(),
  at: z.number(),
  label: z.string(),
  kind: z.enum(['close', 'group', 'bookmarkAndClose', 'archive', 'mute', 'pin']),
  tabs: z.array(undoTabSchema),
  /** Group titles keyed by the original groupId, so undo can rebuild named groups. */
  groupTitles: z.record(z.string(), z.string()).default({}),
  undone: z.boolean().default(false),
});
export type UndoOp = z.infer<typeof undoOpSchema>;

export const undoStackSchema = z.object({
  v: z.literal(SCHEMA_VERSION),
  ops: z.array(undoOpSchema).default([]),
});
export type UndoStack = z.infer<typeof undoStackSchema>;

export const archivedTabSchema = z.object({
  url: z.string(),
  title: z.string(),
  domain: z.string(),
  category: categorySchema,
  archivedAt: z.number(),
});
export const archiveSchema = z.object({
  v: z.literal(SCHEMA_VERSION),
  tabs: z.array(archivedTabSchema).default([]),
});
export type ArchiveState = z.infer<typeof archiveSchema>;

/**
 * Per-DAY aggregates, never per-event rows. A year of per-event history would blow the
 * ~10MB storage.local quota; 180 rows of this costs single-digit KB.
 */
export const dailyRowSchema = z.object({
  day: z.string(), // YYYY-MM-DD
  tabs: z.number(),
  score: z.number(),
  closed: z.number(),
  cleanups: z.number(),
  byCategory: z.record(z.string(), z.number()).default({}),
});
export type DailyRow = z.infer<typeof dailyRowSchema>;

export const dailySchema = z.object({
  v: z.literal(SCHEMA_VERSION),
  rows: z.array(dailyRowSchema).default([]),
});
export type DailyState = z.infer<typeof dailySchema>;

export const savedSessionSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.number(),
  tabs: z.array(
    z.object({
      url: z.string(),
      title: z.string(),
      pinned: z.boolean(),
    }),
  ),
});
export type SavedSession = z.infer<typeof savedSessionSchema>;

export const sessionsSchema = z.object({
  v: z.literal(SCHEMA_VERSION),
  sessions: z.array(savedSessionSchema).default([]),
});
export type SessionsState = z.infer<typeof sessionsSchema>;

export const DEFAULT_SETTINGS: Settings = settingsSchema.parse({ v: SCHEMA_VERSION });
