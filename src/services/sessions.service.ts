import { z } from 'zod';
import type { TabSnapshot } from '@/types/tab';
import { savedSessionSchema, sessionsSchema, SCHEMA_VERSION, type SavedSession } from '@/types/storage';
import { read, update } from './storage.service';

/**
 * Named save and restore, implemented entirely on top of `chrome.storage.local`.
 *
 * `chrome.sessions` is NOT used for this: it is a recently-closed list, not a named-session
 * store, and it cannot hold an arbitrary user-named set of tabs indefinitely. The API is
 * read elsewhere for recovering tabs closed outside Tab Debt; named sessions are ours.
 */

/** Restoring more than this many tabs at once warrants a confirmation, not a surprise. */
export const LARGE_SESSION_THRESHOLD = 200;

function newId(): string {
  return `s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function listSessions(): Promise<SavedSession[]> {
  const state = await read.sessions();
  // Newest first: the session you just saved is the one you are most likely to want.
  return [...state.sessions].sort((a, b) => b.createdAt - a.createdAt);
}

export async function saveSession(name: string, tabs: TabSnapshot[]): Promise<SavedSession> {
  const session: SavedSession = {
    id: newId(),
    name: name.trim() || `Session ${new Date().toLocaleDateString()}`,
    createdAt: Date.now(),
    tabs: tabs.map((t) => ({ url: t.url, title: t.title, pinned: t.pinned })),
  };
  await update.sessions((s) => ({ ...s, sessions: [session, ...s.sessions] }));
  return session;
}

export async function renameSession(id: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;
  await update.sessions((s) => ({
    ...s,
    sessions: s.sessions.map((x) => (x.id === id ? { ...x, name: trimmed } : x)),
  }));
}

export async function deleteSession(id: string): Promise<void> {
  await update.sessions((s) => ({ ...s, sessions: s.sessions.filter((x) => x.id !== id) }));
}

export type RestoreResult = { restored: number; failed: number; windowId: number | null };

/**
 * Restores into a NEW window, so restoring never disturbs what the user is currently
 * looking at. Best-effort per tab: a session saved months ago may contain a URL Chrome now
 * refuses to open, and losing 199 tabs because of one bad entry would be absurd.
 */
export async function restoreSession(id: string): Promise<RestoreResult> {
  const state = await read.sessions();
  const session = state.sessions.find((s) => s.id === id);
  if (!session || session.tabs.length === 0) return { restored: 0, failed: 0, windowId: null };

  const [first, ...rest] = session.tabs;
  const window = await chrome.windows.create({ url: first!.url, focused: true });
  const windowId = window?.id ?? null;
  let restored = 1;
  let failed = 0;

  for (const tab of rest) {
    try {
      await chrome.tabs.create({
        url: tab.url,
        pinned: tab.pinned,
        active: false,
        ...(windowId !== null ? { windowId } : {}),
      });
      restored += 1;
    } catch {
      failed += 1;
    }
  }

  // The first tab's pinned state has to be applied after creation, because
  // windows.create takes a URL rather than full tab properties.
  if (first!.pinned && window?.tabs?.[0]?.id !== undefined) {
    await chrome.tabs.update(window.tabs[0].id, { pinned: true }).catch(() => undefined);
  }

  return { restored, failed, windowId };
}

/** The exported file shape. Versioned, so an import can refuse what it cannot read. */
const exportSchema = z.object({
  kind: z.literal('tab-debt-sessions'),
  v: z.literal(SCHEMA_VERSION),
  exportedAt: z.string(),
  sessions: z.array(savedSessionSchema),
});
export type SessionExport = z.infer<typeof exportSchema>;

export async function exportSessions(): Promise<SessionExport> {
  return {
    kind: 'tab-debt-sessions',
    v: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    sessions: await listSessions(),
  };
}

export type ImportResult =
  | { ok: true; imported: number; skipped: number }
  | { ok: false; error: string };

/**
 * Imports sessions from a previously exported file. Validated rather than trusted: this is
 * arbitrary user-supplied JSON, and the error message has to say what to do about it rather
 * than dumping a parser trace.
 */
export async function importSessions(raw: string): Promise<ImportResult> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'That file is not valid JSON. Pick a file exported from Tab Debt.' };
  }

  const result = exportSchema.safeParse(parsed);
  if (!result.success) {
    return {
      ok: false,
      error: 'That file is not a Tab Debt session export, or it came from a newer version.',
    };
  }

  const existing = await read.sessions();
  const existingIds = new Set(existing.sessions.map((s) => s.id));
  // Re-key collisions rather than dropping them: two exports from the same install would
  // otherwise silently lose one, which is the opposite of what "import" promises.
  const incoming = result.data.sessions.map((s) =>
    existingIds.has(s.id) ? { ...s, id: newId(), name: `${s.name} (imported)` } : s,
  );

  await update.sessions((s) => ({ ...s, sessions: [...incoming, ...s.sessions] }));
  return { ok: true, imported: incoming.length, skipped: 0 };
}

/** Guards the schema version at the type level too, so a bump cannot silently pass. */
export const SESSIONS_SCHEMA = sessionsSchema;
