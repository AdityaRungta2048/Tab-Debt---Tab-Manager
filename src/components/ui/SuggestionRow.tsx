import { useState } from 'preact/hooks';
import type { Suggestion } from '@/types/suggestion';
import type { TabSnapshot } from '@/types/tab';
import { Button, Estimated } from './primitives';
import { isDestructive } from '@/services/actions.service';
import type { SuggestionAction } from '@/types/suggestion';

/**
 * The button label is the verb that happens, derived from the ACTION rather than sliced
 * off the headline. Taking the first two words of the headline produced buttons reading
 * "Bookmark and" — a sentence fragment that stops right before the part that matters.
 */
function actionLabel(action: SuggestionAction, count: number): string {
  switch (action.kind) {
    case 'close':
      return `Close ${count}`;
    case 'bookmarkAndClose':
      return `Bookmark & close ${count}`;
    case 'archive':
      return `Archive ${count}`;
    case 'group':
      return `Group ${count}`;
    case 'pin':
      return `Pin ${count}`;
    case 'mute':
      return `Mute ${count}`;
  }
}

/**
 * A suggestion, its evidence, and its preview. Nothing here executes without the user
 * having been able to see exactly which tabs are affected first — "preview, then execute,
 * then undo" is the whole safety model.
 */
export function SuggestionRow({
  suggestion,
  tabs,
  onRun,
  busy,
}: {
  suggestion: Suggestion;
  tabs: TabSnapshot[];
  onRun: (s: Suggestion) => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const affected = tabs.filter((t) => suggestion.tabIds.includes(t.id));
  const destructive = isDestructive(suggestion.action);

  return (
    <div class="td-row px-3 py-2.5">
      <div class="flex items-start gap-3">
        <div class="min-w-0 flex-1">
          <p class="text-sm font-medium">{suggestion.headline}</p>
          <p class="mt-0.5 text-xs text-muted">{suggestion.detail}</p>
          <div class="mt-1 flex flex-wrap items-center gap-x-2">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              class="whitespace-nowrap text-2xs text-ledger underline underline-offset-2 hover:opacity-80"
            >
              {open ? 'Hide' : 'Preview'} {affected.length} {affected.length === 1 ? 'tab' : 'tabs'}
            </button>
            {suggestion.estimatedMb > 0 && <Estimated mb={suggestion.estimatedMb} />}
          </div>
        </div>
        <Button
          variant={destructive ? 'danger' : 'primary'}
          onClick={() => onRun(suggestion)}
          disabled={busy}
          class="shrink-0 whitespace-nowrap"
        >
          {actionLabel(suggestion.action, affected.length)}
        </Button>
      </div>

      {open && (
        <ul class="mt-2 max-h-40 overflow-y-auto rounded-sm border border-rule">
          {affected.map((tab) => (
            <li key={tab.id} class="td-row flex items-center gap-2 px-2 py-1 last:border-b-0">
              <span class="truncate text-xs">{tab.title || tab.url}</span>
              <span class="num ml-auto shrink-0 text-2xs text-faint">{tab.domain}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
