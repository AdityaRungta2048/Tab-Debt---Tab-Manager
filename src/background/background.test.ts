import { describe, it, expect, beforeEach, vi } from 'vitest';
import { installMockChrome, type MockChrome } from '@/test/mocks/chrome';
import { dayKey, upsertRow, RETENTION_DAYS } from './snapshot';
import type { DailyRow } from '@/types/storage';

let mock: MockChrome;

beforeEach(async () => {
  mock = installMockChrome(400);
  await mock.storage.local.clear();
  vi.resetModules();
});

/**
 * The MV3 worker is killed aggressively. These tests drop ALL module state between events
 * — the closest thing to Chrome terminating the worker in chrome://extensions — and assert
 * the outcome is unchanged. A module-level cache anywhere in this layer fails here.
 */
describe('service worker — survives being killed between any two events', () => {
  it('records activations correctly when the worker dies after every single event', async () => {
    const tabs = await mock.tabs.query({});
    const sample = tabs.slice(0, 5);

    for (const tab of sample) {
      // Cold start: every module is re-evaluated, exactly as after a worker restart.
      vi.resetModules();
      const { recordActivation } = await import('./activity');
      await recordActivation(tab.id, tab.url);
    }

    vi.resetModules();
    const { read } = await import('@/services/storage.service');
    const { activityKey } = await import('@/core/snapshot');
    const state = await read.activity();

    for (const tab of sample) {
      const record = state.records[activityKey(tab.id, tab.url)];
      expect(record, `lost the activation for tab ${tab.id}`).toBeDefined();
      expect(record!.inferred).toBe(false);
      expect(record!.lastActiveAt).not.toBeNull();
    }
  });

  it('does not lose earlier writes when a later handler starts from cold storage', async () => {
    const tabs = (await mock.tabs.query({})).slice(0, 3);

    vi.resetModules();
    const first = await import('./activity');
    await first.recordActivation(tabs[0]!.id, tabs[0]!.url);

    vi.resetModules();
    const second = await import('./activity');
    await second.recordActivation(tabs[1]!.id, tabs[1]!.url);

    vi.resetModules();
    const { read } = await import('@/services/storage.service');
    expect(Object.keys((await read.activity()).records)).toHaveLength(2);
  });

  it('backfills exactly once, even across restarts', async () => {
    vi.resetModules();
    await (await import('./activity')).backfillOnce();
    const { read } = await import('@/services/storage.service');
    const afterFirst = await read.activity();
    expect(afterFirst.backfilledAt).not.toBeNull();
    expect(Object.keys(afterFirst.records).length).toBeGreaterThan(0);

    // Simulate a restart and a second call: it must be a no-op, not a re-stamp.
    vi.resetModules();
    await (await import('./activity')).backfillOnce();
    vi.resetModules();
    const afterSecond = await (await import('@/services/storage.service')).read.activity();
    expect(afterSecond.backfilledAt).toBe(afterFirst.backfilledAt);
  });

  it('marks every backfilled record inferred, since we did not observe them', async () => {
    const { backfillOnce } = await import('./activity');
    await backfillOnce();
    const { read } = await import('@/services/storage.service');
    const records = Object.values((await read.activity()).records);
    expect(records.length).toBeGreaterThan(0);
    expect(records.every((r) => r.inferred)).toBe(true);
  });

  it('never overwrites an observed record with an inferred one during backfill', async () => {
    const tab = (await mock.tabs.query({}))[0]!;
    const { recordActivation, backfillOnce } = await import('./activity');
    const { activityKey } = await import('@/core/snapshot');
    await recordActivation(tab.id, tab.url);
    await backfillOnce();
    const { read } = await import('@/services/storage.service');
    const record = (await read.activity()).records[activityKey(tab.id, tab.url)]!;
    expect(record.inferred).toBe(false);
  });

  it('records a created-but-not-activated tab as a known never-opened', async () => {
    const { recordCreation } = await import('./activity');
    const { activityKey } = await import('@/core/snapshot');
    await recordCreation(9999, 'https://new.example/', false);
    const { read } = await import('@/services/storage.service');
    const record = (await read.activity()).records[activityKey(9999, 'https://new.example/')]!;
    expect(record.lastActiveAt).toBeNull();
    expect(record.inferred).toBe(false);
  });

  it('prunes records for tabs that no longer exist', async () => {
    const { recordActivation, pruneActivity } = await import('./activity');
    await recordActivation(999_999, 'https://gone.example/');
    const { read } = await import('@/services/storage.service');
    expect(Object.keys((await read.activity()).records)).toHaveLength(1);

    // The record is recent, so the TTL keeps it; age it past the cutoff first.
    const { update } = await import('@/services/storage.service');
    await update.activity((s) => ({
      ...s,
      records: Object.fromEntries(
        Object.entries(s.records).map(([k, v]) => [k, { ...v, lastActiveAt: Date.now() - 40 * 86_400_000 }]),
      ),
    }));

    expect(await pruneActivity()).toBe(1);
    expect(Object.keys((await read.activity()).records)).toHaveLength(0);
  });

  it('forgets a closed tab', async () => {
    const { recordActivation, forgetTab } = await import('./activity');
    await recordActivation(4242, 'https://x.example/');
    await forgetTab(4242);
    const { read } = await import('@/services/storage.service');
    expect(Object.keys((await read.activity()).records)).toHaveLength(0);
  });
});

describe('daily roll-up', () => {
  it('keeps one row per day rather than one row per event', () => {
    let rows: DailyRow[] = [];
    const row = (day: string, tabs: number): DailyRow => ({ day, tabs, score: 1, closed: 0, cleanups: 0, byCategory: {} });
    for (let i = 0; i < 50; i++) rows = upsertRow(rows, row('2026-07-15', i));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tabs).toBe(49);
  });

  it('prunes beyond the retention window', () => {
    let rows: DailyRow[] = [];
    for (let i = 0; i < 400; i++) {
      const d = new Date(Date.UTC(2025, 0, 1) + i * 86_400_000);
      rows = upsertRow(rows, { day: dayKey(d.getTime()), tabs: 100, score: 50, closed: 0, cleanups: 0, byCategory: {} });
    }
    expect(rows).toHaveLength(RETENTION_DAYS);
  });

  it('keeps rows sorted by day', () => {
    let rows: DailyRow[] = [];
    for (const day of ['2026-03-05', '2026-01-02', '2026-02-09']) {
      rows = upsertRow(rows, { day, tabs: 1, score: 1, closed: 0, cleanups: 0, byCategory: {} });
    }
    expect(rows.map((r) => r.day)).toEqual(['2026-01-02', '2026-02-09', '2026-03-05']);
  });

  it('does not reset cumulative counters when a second snapshot lands the same day', async () => {
    const { recordCleanup } = await import('./snapshot');
    const { writeDailySnapshot } = await import('./snapshot');
    await recordCleanup(30);
    await writeDailySnapshot();
    const { read } = await import('@/services/storage.service');
    const today = (await read.daily()).rows.find((r) => r.day === dayKey(Date.now()))!;
    expect(today.closed).toBe(30);
    expect(today.cleanups).toBe(1);
    expect(today.tabs).toBeGreaterThan(0);
  });
});
