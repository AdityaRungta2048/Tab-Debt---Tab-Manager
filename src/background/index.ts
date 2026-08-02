import { backfillOnce, forgetTab, pruneActivity, recordActivation, recordCreation } from './activity';
import { writeDailySnapshot } from './snapshot';
import { openDashboard } from '@/services/tabs.service';

/**
 * The MV3 service worker.
 *
 * The governing assumption: this worker is killed between any two lines, and every
 * listener may be the first thing that runs after a cold start. So:
 *   - there is no module-level mutable state, anywhere;
 *   - every handler is read-storage -> compute -> write-storage;
 *   - periodic work uses chrome.alarms, never setTimeout, which does not survive a
 *     restart;
 *   - listeners are registered synchronously at the top level, because a listener
 *     registered inside an async callback is missed on the wake that needed it.
 */

const ALARMS = {
  snapshot: 'td.snapshot',
  prune: 'td.prune',
} as const;

/** chrome.alarms enforces a one-minute floor; these are deliberately far above it. */
const SNAPSHOT_PERIOD_MIN = 60;
const PRUNE_PERIOD_MIN = 6 * 60;

function ensureAlarms(): void {
  chrome.alarms.create(ALARMS.snapshot, { periodInMinutes: SNAPSHOT_PERIOD_MIN });
  chrome.alarms.create(ALARMS.prune, { periodInMinutes: PRUNE_PERIOD_MIN });
}

/** Errors in a worker handler are invisible unless caught and logged. */
function guard(label: string, fn: () => Promise<unknown>): void {
  void fn().catch((err) => console.error(`[tab-debt] ${label} failed`, err));
}

chrome.runtime.onInstalled.addListener(() => {
  ensureAlarms();
  guard('backfill', backfillOnce);
  guard('snapshot', writeDailySnapshot);
});

chrome.runtime.onStartup.addListener(() => {
  // Alarms persist across restarts, but re-creating them is idempotent and cheap
  // insurance against an alarm lost to a crash or an interrupted update.
  ensureAlarms();
  guard('backfill', backfillOnce);
});

chrome.tabs.onActivated.addListener((info) => {
  guard('recordActivation', async () => {
    const tab = await chrome.tabs.get(info.tabId);
    await recordActivation(info.tabId, tab.url ?? tab.pendingUrl ?? '');
  });
});

chrome.tabs.onCreated.addListener((tab) => {
  if (tab.id === undefined) return;
  guard('recordCreation', () =>
    recordCreation(tab.id as number, tab.url ?? tab.pendingUrl ?? '', tab.active === true),
  );
});

/**
 * A tab that navigates gets a new activity key, since keys are id + URL hash. Re-record on
 * committed navigation so an active tab does not appear to become "never opened".
 */
chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (!change.url) return;
  guard('recordNavigation', () => recordCreation(tabId, change.url as string, tab.active === true));
});

chrome.tabs.onRemoved.addListener((tabId) => {
  guard('forgetTab', () => forgetTab(tabId));
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARMS.snapshot) guard('snapshot', writeDailySnapshot);
  if (alarm.name === ALARMS.prune) guard('prune', pruneActivity);
});

/**
 * The toolbar button opens the popup (declared in the manifest). This handles the case
 * where the popup asks the worker to open the dashboard, reusing an existing one.
 */
chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (typeof message === 'object' && message !== null && 'type' in message) {
    const { type } = message as { type: string };
    if (type === 'openDashboard') {
      guard('openDashboard', async () => {
        await openDashboard();
        sendResponse({ ok: true });
      });
      return true; // keep the message channel open for the async response
    }
  }
  return false;
});

// Alarms are also ensured on cold start, because onInstalled/onStartup do not fire when
// the worker is merely revived to service an event.
ensureAlarms();

export { ALARMS, SNAPSHOT_PERIOD_MIN, PRUNE_PERIOD_MIN };
