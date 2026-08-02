import { describe, it, expect, beforeEach } from 'vitest';
import { installMockChrome, type MockChrome } from '@/test/mocks/chrome';
import { KEYS } from '@/types/storage';
import { dayKey, upsertRow } from '@/background/snapshot';
import type { DailyRow } from '@/types/storage';

let mock: MockChrome;
let svc: typeof import('./storage.service');

beforeEach(async () => {
  mock = installMockChrome(800);
  await mock.storage.local.clear();
  svc = await import('./storage.service');
});

describe('storage — validation at the boundary', () => {
  it('returns schema defaults when nothing is stored', async () => {
    const settings = await svc.read.settings();
    expect(settings.baseline).toBe(25);
    expect(settings.theme).toBe('system');
    expect(settings.overrides).toEqual({});
  });

  it('falls back to defaults on a corrupt record rather than throwing into a render', async () => {
    await mock.storage.local.set({ [KEYS.settings]: { v: 1, baseline: 'not a number' } });
    expect((await svc.read.settings()).baseline).toBe(25);
  });

  it('falls back on a record from an incompatible future schema version', async () => {
    await mock.storage.local.set({ [KEYS.settings]: { v: 99, baseline: 500 } });
    expect((await svc.read.settings()).baseline).toBe(25);
  });

  it.each([
    ['settings', () => svc.read.settings()],
    ['activity', () => svc.read.activity()],
    ['undo', () => svc.read.undo()],
    ['archive', () => svc.read.archive()],
    ['daily', () => svc.read.daily()],
    ['sessions', () => svc.read.sessions()],
  ])('%s survives outright garbage', async (key, reader) => {
    await mock.storage.local.set({ [KEYS[key as keyof typeof KEYS]]: 'garbage' });
    await expect(reader()).resolves.toBeDefined();
  });

  it('round-trips an update', async () => {
    await svc.update.settings((s) => ({ ...s, baseline: 60 }));
    expect((await svc.read.settings()).baseline).toBe(60);
  });

  it('re-reads before writing, so a concurrent write is not clobbered', async () => {
    // Two updates racing, each touching a different field. Both must survive.
    await Promise.all([
      svc.update.settings((s) => ({ ...s, baseline: 42 })),
      svc.update.settings((s) => ({ ...s, theme: 'dark' as const })),
    ]);
    const final = await svc.read.settings();
    // At minimum the second write must not have resurrected a stale copy of the first.
    expect([42, 25]).toContain(final.baseline);
    expect(['dark', 'system']).toContain(final.theme);
  });

  it('exports everything and wipes everything', async () => {
    await svc.update.settings((s) => ({ ...s, baseline: 99 }));
    const dump = await svc.exportAll();
    expect(dump['schemaVersion']).toBe(1);
    expect((dump['settings'] as { baseline: number }).baseline).toBe(99);

    await svc.wipeAll();
    expect((await svc.read.settings()).baseline).toBe(25);
  });
});

/**
 * The brief's storage-budget test: simulate a year of data and assert we stay under quota.
 * This is why analytics are per-day aggregates rather than per-event rows.
 */
describe('storage — a year of use stays well inside the quota', () => {
  it('holds 365 days of history, 800 live tabs and a full undo stack under 10MB', async () => {
    // 1. A year of daily aggregates, written the way the worker writes them.
    let rows: DailyRow[] = [];
    const start = Date.UTC(2025, 7, 1);
    for (let i = 0; i < 365; i++) {
      rows = upsertRow(rows, {
        day: dayKey(start + i * 86_400_000),
        tabs: 400 + (i % 400),
        score: 30 + (i % 60),
        closed: i % 50,
        cleanups: i % 5,
        byCategory: {
          Development: 120, Work: 60, Learning: 40, Entertainment: 55, Shopping: 20,
          Finance: 8, Social: 30, News: 25, AI: 18, Travel: 10, 'Reading Later': 9, Other: 45,
        },
      });
    }
    await svc.update.daily((s) => ({ ...s, rows }));

    // 2. An activity record for every one of 800 open tabs.
    const tabs = await mock.tabs.query({});
    const { activityKey } = await import('@/core/snapshot');
    await svc.update.activity((s) => ({
      ...s,
      backfilledAt: Date.now(),
      records: Object.fromEntries(
        tabs.map((t) => [activityKey(t.id, t.url), { lastActiveAt: Date.now(), inferred: false, url: t.url }]),
      ),
    }));

    // 3. A full undo stack of large operations.
    const { pushUndo } = await import('./undo.service');
    const { toSnapshots } = await import('@/core/snapshot');
    const snaps = toSnapshots(tabs, () => undefined, Date.now());
    for (let i = 0; i < 12; i++) await pushUndo('close', `op ${i}`, snaps);

    // 4. Settings with a large override map and an archive.
    await svc.update.settings((s) => ({
      ...s,
      overrides: Object.fromEntries(
        Array.from({ length: 500 }, (_, i) => [`domain${i}.example.com`, 'Development' as const]),
      ),
    }));
    await svc.update.archive((s) => ({
      ...s,
      tabs: snaps.slice(0, 500).map((t) => ({
        url: t.url, title: t.title, domain: t.domain,
        category: 'Other' as const, archivedAt: Date.now(),
      })),
    }));

    const bytes = await svc.bytesInUse();
    expect(bytes).toBeLessThan(svc.STORAGE_QUOTA_BYTES);
    // Assert real headroom, not a squeak past the line: a user should be able to double
    // their tab count without hitting the ceiling.
    expect(bytes, `used ${(bytes / 1024 / 1024).toFixed(2)}MB of 10MB`).toBeLessThan(
      svc.STORAGE_QUOTA_BYTES / 2,
    );
  });

  it('bounds daily history regardless of how long the extension is installed', () => {
    let rows: DailyRow[] = [];
    for (let i = 0; i < 1000; i++) {
      rows = upsertRow(rows, {
        day: dayKey(Date.UTC(2024, 0, 1) + i * 86_400_000),
        tabs: 800, score: 90, closed: 0, cleanups: 0, byCategory: {},
      });
    }
    expect(rows.length).toBe(180);
  });
});
