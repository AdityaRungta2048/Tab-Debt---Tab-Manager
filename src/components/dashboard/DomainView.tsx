import { useMemo, useState } from 'preact/hooks';
import { rollupByDomain, foldSmallDomains, type DomainRow } from '@/core/domains/rollup';
import type { Category, TabSnapshot } from '@/types/tab';
import type { SuggestionAction } from '@/types/suggestion';
import type { MemoryWeights } from '@/core/memory/estimate';
import { formatAgeCompact } from '@/core/staleness/buckets';
import { faviconUrl, activateTab } from '@/services/tabs.service';
import { Button, CategoryChip, Empty, Estimated } from '@/components/ui/primitives';

/**
 * Collapsible domain rows: count, staleness summary and per-domain bulk actions.
 *
 * Rolls up whatever tab list it is handed, so it composes with the filter bar — "GitHub
 * tabs untouched for a month" becomes one row with one button, which is the whole point.
 *
 * Laid out as columns rather than prose (see CRITIQUE #7). A sentence reading "92 tabs, 89
 * untouched for a week or more, 10 never opened" is nearly identical on every row, so the
 * repeated words dominate and the numbers that differ are buried mid-line at three
 * different horizontal positions. In columns they sort visually down the page.
 */
export function DomainView({
  tabs,
  categoryOf,
  weights,
  now,
  onAction,
  busy,
}: {
  tabs: TabSnapshot[];
  categoryOf: (t: TabSnapshot) => Category;
  weights: MemoryWeights;
  now: number;
  onAction: (action: SuggestionAction) => void;
  busy: boolean;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { rows, folded } = useMemo(() => {
    const opts = { now, categoryOf, weights };
    return foldSmallDomains(rollupByDomain(tabs, opts), 3, opts);
  }, [tabs, categoryOf, weights, now]);

  const visible = folded ? [...rows, folded] : rows;

  if (visible.length === 0) {
    return <Empty title="Nothing to group.">No tabs match the current filters.</Empty>;
  }

  const toggleRow = (domain: string): void =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(domain)) next.delete(domain);
      else next.add(domain);
      return next;
    });

  return (
    <div class="flex min-h-0 flex-1 flex-col">
      <div class="flex h-7 shrink-0 items-center gap-2 border-b border-rule bg-card px-3 text-2xs uppercase tracking-[0.1em] text-muted">
        <span class="w-3 shrink-0" />
        <span class="flex-1">Site</span>
        <span class="w-24 shrink-0">Mostly</span>
        <span class="w-12 shrink-0 whitespace-nowrap text-right">Tabs</span>
        <span
          class="w-12 shrink-0 whitespace-nowrap text-right"
          title="Untouched for a week or more, including tabs never opened."
        >
          Stale
        </span>
        <span class="w-12 shrink-0 whitespace-nowrap text-right">Never</span>
        <span class="w-20 shrink-0 whitespace-nowrap text-right">Size (est.)</span>
        <span class="w-[15rem] shrink-0" />
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto">
        {visible.map((row) => (
          <DomainGroup
            key={row.domain}
            row={row}
            now={now}
            open={expanded.has(row.domain)}
            onToggle={() => toggleRow(row.domain)}
            onAction={onAction}
            busy={busy}
          />
        ))}
      </div>
    </div>
  );
}

function DomainGroup({
  row,
  now,
  open,
  onToggle,
  onAction,
  busy,
}: {
  row: DomainRow;
  now: number;
  open: boolean;
  onToggle: () => void;
  onAction: (action: SuggestionAction) => void;
  busy: boolean;
}) {
  const staleIds = row.tabs
    .filter((t) => t.lastActiveAt === null || now - t.lastActiveAt >= 7 * 86_400_000)
    .map((t) => t.id);
  const allIds = row.tabs.map((t) => t.id);
  const sample = row.tabs[0];

  return (
    <section class="border-b border-rule">
      <div class="flex h-9 items-center gap-2 px-3">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={`${open ? 'Collapse' : 'Expand'} ${row.domain}, ${row.count} tabs`}
          class="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span aria-hidden="true" class="w-3 shrink-0 text-2xs text-faint">
            {open ? '▾' : '▸'}
          </span>
          {sample && (
            <img
              src={faviconUrl(sample.url)}
              alt=""
              width={14}
              height={14}
              class="shrink-0 rounded-sm"
            />
          )}
          <span class="num truncate text-xs font-medium">{row.domain}</span>
        </button>

        <span class="w-24 shrink-0">
          <CategoryChip
            label={row.category}
            reason={`Most tabs from ${row.domain} classify as ${row.category}.`}
          />
        </span>
        <span class="num w-12 shrink-0 text-right text-xs font-medium">{row.count}</span>
        <span
          class={`num w-12 shrink-0 text-right text-xs ${row.staleCount > 0 ? 'text-warn' : 'text-faint'}`}
        >
          {row.staleCount || '—'}
        </span>
        <span
          class={`num w-12 shrink-0 text-right text-xs ${row.neverOpened > 0 ? 'text-warn' : 'text-faint'}`}
        >
          {row.neverOpened || '—'}
        </span>
        <span class="w-20 shrink-0 text-right">
          <Estimated mb={row.estimatedMb} labelledByColumn />
        </span>

        {/* Quiet, not danger. Bookmark-and-close saves every tab first and refuses to close
            anything if a single save fails, so it is the safe variant — and a column of 26
            red buttons makes red mean nothing where it matters. See CRITIQUE #6. */}
        <span class="flex w-[15rem] shrink-0 justify-end gap-1">
          <Button
            onClick={() => onAction({ kind: 'group', tabIds: allIds, title: row.domain })}
            disabled={busy}
            class="whitespace-nowrap"
          >
            Group {row.count}
          </Button>
          {staleIds.length > 0 && (
            <Button
              onClick={() =>
                onAction({ kind: 'bookmarkAndClose', tabIds: staleIds, folder: row.domain })
              }
              disabled={busy}
              class="whitespace-nowrap"
            >
              Bookmark &amp; close {staleIds.length}
            </Button>
          )}
        </span>
      </div>

      {open && (
        <ul class="border-t border-rule">
          {row.tabs.map((tab) => (
            <li key={tab.id} class="td-row flex h-row items-center gap-2 px-3 pl-8 last:border-b-0">
              <button
                type="button"
                onClick={() => void activateTab(tab.id)}
                class="min-w-0 flex-1 truncate text-left text-xs hover:underline"
                title={tab.title || tab.url}
              >
                {tab.title || tab.url}
              </button>
              <span class="num w-24 shrink-0 text-right text-2xs text-muted">
                {formatAgeCompact(tab, now)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
