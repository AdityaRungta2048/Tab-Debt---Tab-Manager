import { generateFixture, type FixtureTab } from '../fixtures/generate';

/**
 * An in-memory chrome.* implementing exactly the surface Tab Debt uses — no more.
 * This is what lets the dashboard boot in a plain tab under `vite dev --mode mock`, and
 * what lets the undo test close 100 tabs and assert they came back, in Node, in ms.
 */

type Listener<T extends unknown[]> = (...args: T) => void;

class Event<T extends unknown[]> {
  private ls = new Set<Listener<T>>();
  addListener = (l: Listener<T>): void => void this.ls.add(l);
  removeListener = (l: Listener<T>): void => void this.ls.delete(l);
  hasListener = (l: Listener<T>): boolean => this.ls.has(l);
  emit = (...a: T): void => this.ls.forEach((l) => l(...a));
  /** Test affordance: assert teardown actually happened. */
  count = (): number => this.ls.size;
  clear = (): void => this.ls.clear();
}

export type MockChrome = ReturnType<typeof createMockChrome>;

export function createMockChrome(size = 400, seed = 42) {
  const fixture = generateFixture(size, seed);
  let tabs: FixtureTab[] = fixture.tabs.map((t) => ({ ...t, mutedInfo: { ...t.mutedInfo } }));
  let nextTabId = Math.max(...tabs.map((t) => t.id)) + 1;
  let nextGroupId = 1000;
  const store = new Map<string, unknown>();
  const groups = new Map<number, { id: number; title: string; color: string; windowId: number }>();
  // Mirrors Chrome's real root layout: "0" is the tree root, "1" is the bookmarks bar and
  // "2" is "Other bookmarks", which is where Tab Debt puts its folder.
  const bookmarks: { id: string; parentId?: string; title: string; url?: string }[] = [
    { id: '0', title: '' },
    { id: '1', parentId: '0', title: 'Bookmarks bar' },
    { id: '2', parentId: '0', title: 'Other bookmarks' },
  ];
  let nextBmId = 100;
  const alarms = new Map<string, { name: string; periodInMinutes?: number }>();

  const onActivated = new Event<[{ tabId: number; windowId: number }]>();
  const onRemoved = new Event<[number, { windowId: number; isWindowClosing: boolean }]>();
  const onCreated = new Event<[FixtureTab]>();
  const onUpdated = new Event<[number, Record<string, unknown>, FixtureTab]>();
  const onAlarm = new Event<[{ name: string }]>();
  const onStorageChanged = new Event<[Record<string, { newValue?: unknown }>, string]>();
  const onInstalled = new Event<[{ reason: string }]>();
  const onStartup = new Event<[]>();
  const onMessage = new Event<[unknown, unknown, (r?: unknown) => void]>();

  for (const gid of [900, 901]) {
    groups.set(gid, { id: gid, title: gid === 900 ? 'GitHub' : 'Video', color: 'blue', windowId: 100 });
  }

  const matches = (t: FixtureTab, q: Record<string, unknown> = {}): boolean =>
    (q['windowId'] === undefined || t.windowId === q['windowId']) &&
    (q['pinned'] === undefined || t.pinned === q['pinned']) &&
    (q['active'] === undefined || t.active === q['active']) &&
    (q['groupId'] === undefined || t.groupId === q['groupId']) &&
    (q['discarded'] === undefined || t.discarded === q['discarded']);

  const api = {
    __fixture: fixture,
    __reset: (n: number, s = 42): void => {
      const f = generateFixture(n, s);
      tabs = f.tabs.map((t) => ({ ...t, mutedInfo: { ...t.mutedInfo } }));
      nextTabId = Math.max(...tabs.map((t) => t.id)) + 1;
    },
    __tabs: (): FixtureTab[] => tabs,
    __events: { onActivated, onRemoved, onCreated, onUpdated, onAlarm, onStorageChanged },

    runtime: {
      id: 'mock-extension-id',
      lastError: undefined as { message: string } | undefined,
      getURL: (p: string): string => `chrome-extension://mock-extension-id/${p.replace(/^\//, '')}`,
      getManifest: () => ({ version: '1.0.0' }),
      onInstalled,
      onStartup,
      onMessage,
      sendMessage: async (m: unknown): Promise<void> => void onMessage.emit(m, {}, () => {}),
    },

    tabs: {
      query: async (q: Record<string, unknown> = {}): Promise<FixtureTab[]> =>
        tabs.filter((t) => matches(t, q)).map((t) => ({ ...t })),
      get: async (id: number): Promise<FixtureTab> => {
        const t = tabs.find((x) => x.id === id);
        if (!t) throw new Error(`No tab with id: ${id}`);
        return { ...t };
      },
      create: async (props: Record<string, unknown>): Promise<FixtureTab> => {
        const windowId = (props['windowId'] as number) ?? 100;
        const tab: FixtureTab = {
          id: nextTabId++,
          index: (props['index'] as number) ?? tabs.filter((t) => t.windowId === windowId).length,
          windowId,
          url: (props['url'] as string) ?? 'about:blank',
          title: (props['url'] as string) ?? 'New Tab',
          pinned: (props['pinned'] as boolean) ?? false,
          audible: false,
          mutedInfo: { muted: false },
          discarded: false,
          active: (props['active'] as boolean) ?? false,
          groupId: -1,
          lastAccessed: Date.now(),
        };
        tabs.push(tab);
        onCreated.emit({ ...tab });
        return { ...tab };
      },
      remove: async (ids: number | number[]): Promise<void> => {
        for (const id of Array.isArray(ids) ? ids : [ids]) {
          const t = tabs.find((x) => x.id === id);
          if (!t) continue;
          tabs = tabs.filter((x) => x.id !== id);
          onRemoved.emit(id, { windowId: t.windowId, isWindowClosing: false });
        }
      },
      update: async (id: number, props: Record<string, unknown>): Promise<FixtureTab> => {
        const t = tabs.find((x) => x.id === id);
        if (!t) throw new Error(`No tab with id: ${id}`);
        if (props['pinned'] !== undefined) t.pinned = props['pinned'] as boolean;
        if (props['muted'] !== undefined) t.mutedInfo = { muted: props['muted'] as boolean };
        if (props['active'] !== undefined) t.active = props['active'] as boolean;
        if (props['url'] !== undefined) t.url = props['url'] as string;
        onUpdated.emit(id, props, { ...t });
        return { ...t };
      },
      move: async (id: number, props: { index: number; windowId?: number }): Promise<void> => {
        const t = tabs.find((x) => x.id === id);
        if (!t) return;
        if (props.windowId !== undefined) t.windowId = props.windowId;
        t.index = props.index;
      },
      group: async (opts: { tabIds: number[]; groupId?: number; createProperties?: { windowId?: number } }): Promise<number> => {
        const gid = opts.groupId ?? nextGroupId++;
        if (!groups.has(gid)) {
          groups.set(gid, {
            id: gid,
            title: '',
            color: 'grey',
            windowId: opts.createProperties?.windowId ?? 100,
          });
        }
        for (const id of opts.tabIds) {
          const t = tabs.find((x) => x.id === id);
          if (t) t.groupId = gid;
        }
        return gid;
      },
      ungroup: async (ids: number[]): Promise<void> => {
        for (const id of ids) {
          const t = tabs.find((x) => x.id === id);
          if (t) t.groupId = -1;
        }
      },
      onActivated,
      onRemoved,
      onCreated,
      onUpdated,
    },

    tabGroups: {
      TAB_GROUP_ID_NONE: -1,
      query: async (): Promise<unknown[]> => [...groups.values()],
      get: async (id: number): Promise<unknown> => groups.get(id),
      update: async (id: number, props: { title?: string; color?: string }): Promise<void> => {
        const g = groups.get(id);
        if (g) Object.assign(g, props);
      },
    },

    windows: {
      WINDOW_ID_CURRENT: -2,
      getAll: async (): Promise<{ id: number }[]> =>
        [...new Set(tabs.map((t) => t.windowId))].map((id) => ({ id })),
      getCurrent: async (): Promise<{ id: number }> => ({ id: 100 }),
      create: async (props: { url?: string[] }): Promise<{ id: number }> => {
        const id = 100 + [...new Set(tabs.map((t) => t.windowId))].length;
        for (const url of props.url ?? []) await api.tabs.create({ url, windowId: id });
        return { id };
      },
      update: async (): Promise<void> => {},
    },

    storage: {
      local: {
        get: async (keys?: string | string[] | null): Promise<Record<string, unknown>> => {
          if (keys === undefined || keys === null) return Object.fromEntries(store);
          const list = Array.isArray(keys) ? keys : [keys];
          const out: Record<string, unknown> = {};
          for (const k of list) if (store.has(k)) out[k] = store.get(k);
          return out;
        },
        set: async (items: Record<string, unknown>): Promise<void> => {
          const changes: Record<string, { newValue?: unknown }> = {};
          for (const [k, v] of Object.entries(items)) {
            store.set(k, v);
            changes[k] = { newValue: v };
          }
          onStorageChanged.emit(changes, 'local');
        },
        remove: async (keys: string | string[]): Promise<void> => {
          for (const k of Array.isArray(keys) ? keys : [keys]) store.delete(k);
        },
        clear: async (): Promise<void> => void store.clear(),
        getBytesInUse: async (): Promise<number> =>
          new Blob([JSON.stringify(Object.fromEntries(store))]).size,
      },
      onChanged: onStorageChanged,
    },

    alarms: {
      create: (name: string, info: { periodInMinutes?: number }): void => {
        alarms.set(name, { name, ...info });
      },
      clear: async (name: string): Promise<boolean> => alarms.delete(name),
      getAll: async (): Promise<unknown[]> => [...alarms.values()],
      onAlarm,
      __fire: (name: string): void => onAlarm.emit({ name }),
    },

    bookmarks: {
      create: async (b: { parentId?: string; title: string; url?: string }): Promise<{ id: string }> => {
        const node = { id: String(nextBmId++), ...b };
        bookmarks.push(node);
        return node;
      },
      search: async (q: { title?: string }): Promise<unknown[]> =>
        bookmarks.filter((b) => !q.title || b.title === q.title),
      getChildren: async (id: string): Promise<{ id: string; title: string; url?: string }[]> =>
        bookmarks.filter((b) => b.parentId === id),
      getTree: async (): Promise<unknown[]> => {
        const build = (id: string): unknown => ({
          ...bookmarks.find((b) => b.id === id),
          children: bookmarks.filter((b) => b.parentId === id).map((c) => build(c.id)),
        });
        return [build('0')];
      },
      __all: (): unknown[] => bookmarks,
    },

    sessions: {
      getRecentlyClosed: async (): Promise<unknown[]> => [],
    },
  };

  return api;
}

/** Installs the mock as the global `chrome`. Dev/test only — never bundled into the crx. */
export function installMockChrome(size = 400, seed = 42): MockChrome {
  const mock = createMockChrome(size, seed);
  (globalThis as unknown as { chrome: unknown }).chrome = mock;
  return mock;
}
