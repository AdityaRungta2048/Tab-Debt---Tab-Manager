import { describe, it, expect, beforeEach } from 'vitest';
import { installMockChrome, type MockChrome } from '@/test/mocks/chrome';
import { toSnapshots } from '@/core/snapshot';
import type { TabSnapshot } from '@/types/tab';

let mock: MockChrome;
let svc: typeof import('./sessions.service');

async function snaps(): Promise<TabSnapshot[]> {
  return toSnapshots(await mock.tabs.query({}), () => undefined, Date.now());
}

beforeEach(async () => {
  mock = installMockChrome(200);
  await mock.storage.local.clear();
  svc = await import('./sessions.service');
});

describe('save, list, rename, delete', () => {
  it('saves a named session with its tab count and creation date', async () => {
    const tabs = (await snaps()).slice(0, 5);
    const session = await svc.saveSession('Research', tabs);

    expect(session.name).toBe('Research');
    expect(session.tabs).toHaveLength(5);
    expect(session.createdAt).toBeGreaterThan(0);

    const list = await svc.listSessions();
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe(session.id);
  });

  it('preserves url, title and pinned state, and nothing else', async () => {
    const tabs = (await snaps()).filter((t) => t.pinned).slice(0, 2);
    expect(tabs.length).toBeGreaterThan(0);
    const session = await svc.saveSession('Pinned', tabs);
    expect(session.tabs[0]).toEqual({
      url: tabs[0]!.url,
      title: tabs[0]!.title,
      pinned: true,
    });
  });

  it('falls back to a dated name rather than saving an untitled session', async () => {
    const session = await svc.saveSession('   ', (await snaps()).slice(0, 2));
    expect(session.name).toMatch(/^Session /);
  });

  it('lists newest first', async () => {
    const tabs = (await snaps()).slice(0, 2);
    await svc.saveSession('First', tabs);
    await new Promise((r) => setTimeout(r, 2));
    await svc.saveSession('Second', tabs);
    expect((await svc.listSessions()).map((s) => s.name)).toEqual(['Second', 'First']);
  });

  it('renames, ignoring an empty name rather than blanking the session', async () => {
    const s = await svc.saveSession('Old', (await snaps()).slice(0, 2));
    await svc.renameSession(s.id, 'New');
    expect((await svc.listSessions())[0]!.name).toBe('New');

    await svc.renameSession(s.id, '   ');
    expect((await svc.listSessions())[0]!.name).toBe('New');
  });

  it('deletes', async () => {
    const s = await svc.saveSession('Temp', (await snaps()).slice(0, 2));
    await svc.deleteSession(s.id);
    expect(await svc.listSessions()).toEqual([]);
  });

  it('survives a storage round trip with validation intact', async () => {
    await svc.saveSession('Persisted', (await snaps()).slice(0, 3));
    const { read } = await import('./storage.service');
    expect((await read.sessions()).sessions[0]!.name).toBe('Persisted');
  });
});

describe('restore', () => {
  it('restores into a NEW window, leaving the current one undisturbed', async () => {
    const tabs = (await snaps()).slice(0, 6);
    const windowsBefore = new Set((await mock.tabs.query({})).map((t) => t.windowId));
    const tabsBefore = (await mock.tabs.query({})).length;

    const session = await svc.saveSession('Restore me', tabs);
    const result = await svc.restoreSession(session.id);

    expect(result.restored).toBe(6);
    expect(result.failed).toBe(0);
    expect(result.windowId).not.toBeNull();
    expect(windowsBefore.has(result.windowId!), 'restored into an existing window').toBe(false);
    expect((await mock.tabs.query({})).length).toBe(tabsBefore + 6);

    const restored = (await mock.tabs.query({})).filter((t) => t.windowId === result.windowId);
    expect(restored.map((t) => t.url).sort()).toEqual(tabs.map((t) => t.url).sort());
  });

  it('restores pinned state, including on the first tab', async () => {
    const pinned = (await snaps()).filter((t) => t.pinned).slice(0, 1);
    const plain = (await snaps()).filter((t) => !t.pinned).slice(0, 2);
    const session = await svc.saveSession('Mixed', [...pinned, ...plain]);
    const result = await svc.restoreSession(session.id);

    const restored = (await mock.tabs.query({})).filter((t) => t.windowId === result.windowId);
    const firstUrl = pinned[0]!.url;
    expect(restored.find((t) => t.url === firstUrl)?.pinned).toBe(true);
  });

  it('does not steal focus from the tabs it restores after the first', async () => {
    const session = await svc.saveSession('Quiet', (await snaps()).slice(0, 5));
    const result = await svc.restoreSession(session.id);
    const restored = (await mock.tabs.query({})).filter((t) => t.windowId === result.windowId);
    expect(restored.filter((t) => t.active).length).toBeLessThanOrEqual(1);
  });

  it('returns a zero result for an unknown id rather than throwing', async () => {
    expect(await svc.restoreSession('nope')).toEqual({ restored: 0, failed: 0, windowId: null });
  });

  it('flags a large session so the UI can warn before restoring it', async () => {
    // Explicitly above the threshold: the 200-tab fixture sits exactly on it, and a test
    // that straddles its own boundary proves nothing either way.
    mock = installMockChrome(400);
    await mock.storage.local.clear();
    const many = await snaps();
    expect(many.length).toBeGreaterThan(svc.LARGE_SESSION_THRESHOLD);

    const session = await svc.saveSession('Everything', many);
    expect(session.tabs.length).toBeGreaterThan(svc.LARGE_SESSION_THRESHOLD);
  });
});

describe('export and import', () => {
  it('round-trips through JSON', async () => {
    const tabs = (await snaps()).slice(0, 4);
    await svc.saveSession('Alpha', tabs);
    await svc.saveSession('Beta', tabs.slice(0, 2));

    const dump = await svc.exportSessions();
    expect(dump.kind).toBe('tab-debt-sessions');
    expect(dump.sessions).toHaveLength(2);

    // Wipe, then import the same file back.
    for (const s of await svc.listSessions()) await svc.deleteSession(s.id);
    expect(await svc.listSessions()).toEqual([]);

    const result = await svc.importSessions(JSON.stringify(dump));
    expect(result).toMatchObject({ ok: true, imported: 2 });
    const restored = await svc.listSessions();
    expect(restored.map((s) => s.name).sort()).toEqual(['Alpha', 'Beta']);
    expect(restored.find((s) => s.name === 'Alpha')!.tabs).toHaveLength(4);
  });

  it('re-keys colliding ids instead of silently dropping a session', async () => {
    const tabs = (await snaps()).slice(0, 2);
    await svc.saveSession('Dupe', tabs);
    const dump = await svc.exportSessions();

    // Import the same export back on top of itself.
    const result = await svc.importSessions(JSON.stringify(dump));
    expect(result).toMatchObject({ ok: true, imported: 1 });

    const list = await svc.listSessions();
    expect(list).toHaveLength(2);
    expect(new Set(list.map((s) => s.id)).size).toBe(2);
    expect(list.some((s) => s.name === 'Dupe (imported)')).toBe(true);
  });

  it.each([
    ['not json at all', 'not valid JSON'],
    ['{"kind":"something-else"}', 'not a Tab Debt session export'],
    ['{"kind":"tab-debt-sessions","v":99,"exportedAt":"x","sessions":[]}', 'newer version'],
    ['{"kind":"tab-debt-sessions","v":1,"exportedAt":"x","sessions":[{"bad":true}]}', 'not a Tab Debt session export'],
  ])('rejects %s with an actionable message', async (raw, expected) => {
    const result = await svc.importSessions(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(expected);
  });

  it('leaves existing sessions untouched when an import fails', async () => {
    await svc.saveSession('Keep me', (await snaps()).slice(0, 2));
    await svc.importSessions('garbage');
    expect((await svc.listSessions()).map((s) => s.name)).toEqual(['Keep me']);
  });
});
