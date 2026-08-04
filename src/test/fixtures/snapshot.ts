import { toSnapshots } from '@/core/snapshot';
import type { DebtInput, TabSnapshot } from '@/types/tab';
import { generateFixture, type Fixture } from './generate';

/**
 * Fixture -> TabSnapshot[] through the *real* conversion in core/snapshot.ts, so tests
 * never quietly diverge from what the extension actually feeds its own domain logic.
 */
export function fixtureSnapshots(size = 400, seed = 42): { tabs: TabSnapshot[]; fixture: Fixture } {
  const fixture = generateFixture(size, seed);
  const tabs = toSnapshots(fixture.tabs, () => undefined, fixture.now);
  return { tabs, fixture };
}

export function fixtureInput(size = 400, seed = 42, baseline = 25): DebtInput {
  const { tabs, fixture } = fixtureSnapshots(size, seed);
  return {
    tabs,
    windowCount: new Set(tabs.map((t) => t.windowId)).size,
    now: fixture.now,
    baseline,
  };
}
