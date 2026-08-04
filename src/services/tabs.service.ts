import { toSnapshots, activityKey } from '@/core/snapshot';
import type { TabSnapshot, DebtInput } from '@/types/tab';
import { read } from './storage.service';

/**
 * The Chrome tabs adapter. Everything above this line works in plain data.
 *
 * The dashboard is itself a tab, and counting it would mean the product inflates the very
 * number it exists to reduce — and worse, could close itself mid-operation. It is excluded
 * from every snapshot, and therefore from every count, score, suggestion and bulk action.
 */

export function dashboardUrl(): string {
  return chrome.runtime.getURL('src/pages/dashboard/index.html');
}

function isOwnPage(url: string | undefined): boolean {
  if (!url) return false;
  return url.startsWith(chrome.runtime.getURL(''));
}

export async function getSnapshot(): Promise<DebtInput> {
  const [raw, activity, settings] = await Promise.all([
    chrome.tabs.query({}),
    read.activity(),
    read.settings(),
  ]);
  const now = Date.now();
  const visible = raw.filter((t) => !isOwnPage(t.url ?? t.pendingUrl));
  const tabs = toSnapshots(visible, (key) => activity.records[key], now);
  return {
    tabs,
    windowCount: new Set(tabs.map((t) => t.windowId)).size,
    now,
    baseline: settings.baseline,
  };
}

/** Favicons come from Chrome's own cache via the `favicon` permission. Never the network. */
export function faviconUrl(pageUrl: string, size = 16): string {
  const url = new URL(chrome.runtime.getURL('/_favicon/'));
  url.searchParams.set('pageUrl', pageUrl);
  url.searchParams.set('size', String(size));
  return url.toString();
}

export async function activateTab(tabId: number): Promise<void> {
  const tab = await chrome.tabs.get(tabId);
  await chrome.tabs.update(tabId, { active: true });
  if (tab.windowId !== undefined) {
    await chrome.windows.update(tab.windowId, { focused: true });
  }
}

export async function closeTabs(tabIds: number[]): Promise<void> {
  if (tabIds.length === 0) return;
  await chrome.tabs.remove(tabIds);
}

export async function setPinned(tabIds: number[], pinned: boolean): Promise<void> {
  await Promise.all(tabIds.map((id) => chrome.tabs.update(id, { pinned })));
}

export async function setMuted(tabIds: number[], muted: boolean): Promise<void> {
  await Promise.all(tabIds.map((id) => chrome.tabs.update(id, { muted })));
}

/**
 * Group tabs, naming the group. Tabs must be grouped per window: chrome.tabs.group cannot
 * span windows, and a bulk selection routinely does.
 */
export async function groupTabs(tabIds: number[], title: string): Promise<number[]> {
  if (tabIds.length === 0) return [];
  const tabs = await Promise.all(tabIds.map((id) => chrome.tabs.get(id).catch(() => null)));
  const byWindow = new Map<number, number[]>();
  for (const t of tabs) {
    if (!t || t.id === undefined) continue;
    const list = byWindow.get(t.windowId);
    if (list) list.push(t.id);
    else byWindow.set(t.windowId, [t.id]);
  }

  const groupIds: number[] = [];
  for (const [windowId, ids] of byWindow) {
    const groupId = await chrome.tabs.group({ tabIds: ids, createProperties: { windowId } });
    await chrome.tabGroups.update(groupId, { title, collapsed: true });
    groupIds.push(groupId);
  }
  return groupIds;
}

export async function ungroupTabs(tabIds: number[]): Promise<void> {
  if (tabIds.length === 0) return;
  await chrome.tabs.ungroup(tabIds);
}

export type GroupInfo = { id: number; title: string; color: string };

export async function getGroups(): Promise<Map<number, GroupInfo>> {
  const out = new Map<number, GroupInfo>();
  if (!chrome.tabGroups) return out;
  const groups = await chrome.tabGroups.query({});
  for (const g of groups) out.set(g.id, { id: g.id, title: g.title ?? '', color: g.color });
  return out;
}

export async function countWindows(): Promise<number> {
  const windows = await chrome.windows.getAll({});
  return windows.length;
}

/**
 * Opens the dashboard, reusing an existing dashboard tab if one is already open. Creating
 * a second copy of the tab manager is exactly the behaviour the product exists to prevent.
 */
export async function openDashboard(): Promise<void> {
  const url = dashboardUrl();
  const existing = await chrome.tabs.query({ url: `${url}*` });
  const first = existing[0];
  if (first?.id !== undefined) {
    await chrome.tabs.update(first.id, { active: true });
    if (first.windowId !== undefined) await chrome.windows.update(first.windowId, { focused: true });
    return;
  }
  await chrome.tabs.create({ url, active: true });
}

export { activityKey };
export type { TabSnapshot };
