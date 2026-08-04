import type { TabSnapshot } from '@/types/tab';

/**
 * Bookmark-before-close. Everything lands under a single "Tab Debt" root so the user's
 * bookmark bar is never littered, and inside a dated folder so repeated cleanups stay
 * distinguishable a month later.
 */

export const ROOT_TITLE = 'Tab Debt';

async function findChildByTitle(parentId: string, title: string): Promise<string | null> {
  const children = await chrome.bookmarks.getChildren(parentId);
  const hit = children.find((c) => c.title === title && !c.url);
  return hit?.id ?? null;
}

async function ensureFolder(parentId: string, title: string): Promise<string> {
  const existing = await findChildByTitle(parentId, title);
  if (existing) return existing;
  const created = await chrome.bookmarks.create({ parentId, title });
  return created.id;
}

/** "Other bookmarks" is id "2" in Chrome; fall back to the tree root if that ever changes. */
async function otherBookmarksId(): Promise<string> {
  const tree = await chrome.bookmarks.getTree();
  const root = tree[0];
  const other = root?.children?.find((c) => c.id === '2') ?? root?.children?.[1] ?? root?.children?.[0];
  return other?.id ?? '1';
}

export function dateFolderName(now = new Date()): string {
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export type BookmarkResult = { saved: number; failed: number; folderPath: string };

/**
 * Saves tabs into `Tab Debt / YYYY-MM-DD / <label>`. Returns counts rather than throwing
 * on a partial failure: the caller needs to know whether it is safe to close the tabs,
 * and "some saved" must never be reported as "all saved".
 */
export async function bookmarkTabs(tabs: TabSnapshot[], label: string): Promise<BookmarkResult> {
  if (tabs.length === 0) return { saved: 0, failed: 0, folderPath: '' };

  const otherId = await otherBookmarksId();
  const rootId = await ensureFolder(otherId, ROOT_TITLE);
  const dateId = await ensureFolder(rootId, dateFolderName());
  const targetId = label ? await ensureFolder(dateId, label) : dateId;

  let saved = 0;
  let failed = 0;
  for (const tab of tabs) {
    try {
      await chrome.bookmarks.create({
        parentId: targetId,
        title: tab.title || tab.url,
        url: tab.url,
      });
      saved += 1;
    } catch {
      failed += 1;
    }
  }

  const folderPath = `${ROOT_TITLE} / ${dateFolderName()}${label ? ` / ${label}` : ''}`;
  return { saved, failed, folderPath };
}
