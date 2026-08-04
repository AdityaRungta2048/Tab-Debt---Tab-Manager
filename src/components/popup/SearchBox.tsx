import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { canReuse, search, type SearchIndex, type SearchResult } from '@/core/search/search';
import { activateTab, closeTabs, faviconUrl } from '@/services/tabs.service';
import type { TabSnapshot } from '@/types/tab';

/**
 * Keyboard-first search. Arrows navigate, Enter switches to the tab and focuses its
 * window, Cmd/Ctrl+Enter closes it, Escape clears.
 *
 * The previous result list is carried forward whenever the query merely extends the last
 * one, so a keystroke filters what is already on screen instead of rescanning 800 entries.
 */
export function SearchBox({
  index,
  tabs,
  onChanged,
  autoFocus = false,
  maxResults = 40,
}: {
  index: SearchIndex;
  tabs: TabSnapshot[];
  onChanged: () => void;
  autoFocus?: boolean;
  maxResults?: number;
}) {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const previous = useRef<{ query: string; results: SearchResult[] } | null>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const byId = useMemo(() => new Map(tabs.map((t) => [t.id, t])), [tabs]);

  const results = useMemo(() => {
    if (!query.trim()) {
      previous.current = null;
      return [];
    }
    const prev = previous.current;
    const reuse = prev && canReuse(prev.query, query) ? prev.results : undefined;
    const out = search(index, query, reuse);
    previous.current = { query, results: out };
    return out.slice(0, maxResults);
  }, [index, query, maxResults]);

  useEffect(() => setCursor(0), [query]);

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  const handleKey = async (e: KeyboardEvent): Promise<void> => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setQuery('');
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, results.length - 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
      return;
    }
    if (e.key === 'Enter') {
      const hit = results[cursor];
      if (!hit) return;
      e.preventDefault();
      if (e.metaKey || e.ctrlKey) {
        await closeTabs([hit.id]);
        onChanged();
      } else {
        await activateTab(hit.id);
        window.close();
      }
    }
  };

  return (
    <div class="border-b border-rule">
      <input
        ref={inputRef}
        type="search"
        value={query}
        onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
        onKeyDown={(e) => void handleKey(e)}
        placeholder="Search tabs"
        aria-label="Search tabs by title, address, site or category"
        aria-describedby="search-help"
        class="w-full bg-transparent px-3 py-2.5 text-md outline-none placeholder:text-faint"
      />
      <p id="search-help" class="sr-only">
        Use the up and down arrow keys to move through results. Press Enter to switch to a tab,
        Control or Command plus Enter to close it, and Escape to clear the search.
      </p>

      {query.trim() && (
        <ul ref={listRef} class="max-h-64 overflow-y-auto border-t border-rule" role="listbox" aria-label="Search results">
          {results.map((r, i) => {
            const tab = byId.get(r.id);
            if (!tab) return null;
            return (
              <li
                key={r.id}
                role="option"
                aria-selected={i === cursor}
                data-active={i === cursor}
                class={`td-row flex h-row cursor-pointer items-center gap-2 px-3 ${i === cursor ? 'bg-[color:var(--ledger-soft)]' : ''}`}
                onMouseEnter={() => setCursor(i)}
                onClick={() => void activateTab(r.id).then(() => window.close())}
              >
                <img src={faviconUrl(tab.url)} alt="" width={14} height={14} class="shrink-0 rounded-sm" />
                <span class="truncate text-xs">{tab.title || tab.url}</span>
                <span class="num ml-auto shrink-0 text-2xs text-faint">{tab.domain}</span>
              </li>
            );
          })}
          {results.length === 0 && (
            <li class="px-3 py-4 text-center text-xs text-muted">
              Nothing matches “{query}”.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
