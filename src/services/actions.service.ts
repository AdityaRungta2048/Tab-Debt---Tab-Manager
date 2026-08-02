import type { TabSnapshot } from '@/types/tab';
import type { SuggestionAction } from '@/types/suggestion';
import { bookmarkTabs } from './bookmarks.service';
import { closeTabs, groupTabs, setMuted, setPinned } from './tabs.service';
import { pushUndo } from './undo.service';
import { update } from './storage.service';
import { classify } from '@/core/categorize/classify';

/**
 * Every bulk action funnels through here, so there is exactly one place where the
 * snapshot-before-destroy rule can be got wrong — and it is enforced by ordering: the
 * undo entry is written before anything is closed, never after.
 */

export type ActionResult = {
  /** Past tense, for the toast: "Closed 19 duplicates." */
  message: string;
  undoId: string | null;
  affected: number;
  /** Set when something went partly wrong and the user needs to know before acting again. */
  warning?: string;
};

const plural = (n: number, one: string, many = `${one}s`): string => (n === 1 ? one : many);

export async function executeAction(
  action: SuggestionAction,
  tabs: TabSnapshot[],
): Promise<ActionResult> {
  const targets = tabs.filter((t) => action.tabIds.includes(t.id));
  if (targets.length === 0) {
    return { message: 'Those tabs are already gone.', undoId: null, affected: 0 };
  }
  const n = targets.length;

  switch (action.kind) {
    case 'close': {
      const undoId = await pushUndo('close', `Closed ${n} ${plural(n, 'tab')}`, targets);
      await closeTabs(targets.map((t) => t.id));
      return { message: `Closed ${n} ${plural(n, 'tab')}`, undoId, affected: n };
    }

    case 'bookmarkAndClose': {
      const undoId = await pushUndo('bookmarkAndClose', `Closed ${n} ${plural(n, 'tab')}`, targets);
      const saved = await bookmarkTabs(targets, action.folder);
      // Close only what was actually saved. Closing a tab whose bookmark failed is the one
      // outcome this action exists to prevent.
      if (saved.failed > 0) {
        return {
          message: `Saved ${saved.saved} of ${n} to ${saved.folderPath}`,
          undoId,
          affected: 0,
          warning: `${saved.failed} ${plural(saved.failed, 'bookmark')} could not be saved, so nothing was closed. Your tabs are untouched.`,
        };
      }
      await closeTabs(targets.map((t) => t.id));
      return {
        message: `Saved to ${saved.folderPath} and closed ${n} ${plural(n, 'tab')}`,
        undoId,
        affected: n,
      };
    }

    case 'archive': {
      const undoId = await pushUndo('archive', `Archived ${n} ${plural(n, 'tab')}`, targets);
      const now = Date.now();
      await update.archive((state) => ({
        ...state,
        tabs: [
          ...targets.map((t) => ({
            url: t.url,
            title: t.title,
            domain: t.domain,
            category: classify({ url: t.url, title: t.title }).category,
            archivedAt: now,
          })),
          ...state.tabs,
        ],
      }));
      await closeTabs(targets.map((t) => t.id));
      return { message: `Archived ${n} ${plural(n, 'tab')}`, undoId, affected: n };
    }

    case 'group': {
      const undoId = await pushUndo('group', `Grouped ${n} ${plural(n, 'tab')}`, targets);
      const groups = await groupTabs(targets.map((t) => t.id), action.title);
      const spread = groups.length > 1;
      return {
        message: `Grouped ${n} ${plural(n, 'tab')} as "${action.title}"`,
        undoId,
        affected: n,
        ...(spread
          ? { warning: `Made ${groups.length} groups, one per window — Chrome cannot group across windows.` }
          : {}),
      };
    }

    case 'pin': {
      const undoId = await pushUndo('pin', `Pinned ${n} ${plural(n, 'tab')}`, targets);
      await setPinned(targets.map((t) => t.id), true);
      return { message: `Pinned ${n} ${plural(n, 'tab')}`, undoId, affected: n };
    }

    case 'mute': {
      const undoId = await pushUndo('mute', `Muted ${n} ${plural(n, 'tab')}`, targets);
      await setMuted(targets.map((t) => t.id), true);
      return { message: `Muted ${n} ${plural(n, 'tab')}`, undoId, affected: n };
    }
  }
}

/** True when the action destroys tabs and therefore needs a preview and a confirmation. */
export function isDestructive(action: SuggestionAction): boolean {
  return action.kind === 'close' || action.kind === 'bookmarkAndClose' || action.kind === 'archive';
}
