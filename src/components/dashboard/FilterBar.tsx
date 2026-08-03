import {
  QUICK_FILTERS,
  QUICK_LABELS,
  activeChips,
  clearAll,
  countActive,
  isEmpty,
  toggle,
  type FilterState,
} from '@/core/filters/filters';
import type { Category, TabSnapshot } from '@/types/tab';
import { CATEGORIES } from '@/types/tab';
import { Button } from '@/components/ui/primitives';

/**
 * The filter controls plus the visible active-filter bar.
 *
 * The active bar is not decoration: with filters that AND together, a user who forgets one
 * is on sees an empty register and concludes the product is broken. Every active filter is
 * therefore always on screen and individually removable, with one click to clear them all.
 */
export function FilterBar({
  state,
  onChange,
  tabs,
  categoryOf,
  matchCount,
  totalCount,
}: {
  state: FilterState;
  onChange: (next: FilterState) => void;
  tabs: TabSnapshot[];
  categoryOf: (t: TabSnapshot) => Category;
  matchCount: number;
  totalCount: number;
}) {
  const chips = activeChips(state);
  const windowIds = [...new Set(tabs.map((t) => t.windowId))].sort((a, b) => a - b);

  // Only offer categories that are actually present. A filter for a category with no tabs
  // is a guaranteed empty result, which teaches the user the filters are untrustworthy.
  const present = new Set(tabs.map(categoryOf));
  const categories = CATEGORIES.filter((c) => present.has(c));

  return (
    <div class="border-b border-rule">
      <div class="flex flex-wrap items-center gap-1 px-3 py-1.5">
        <span class="mr-1 text-2xs uppercase tracking-[0.1em] text-muted">Filter</span>
        {QUICK_FILTERS.map((q) => {
          const on = state.quick.includes(q);
          return (
            <button
              key={q}
              type="button"
              onClick={() => onChange(toggle(state, 'quick', q))}
              aria-pressed={on}
              class={`rounded-sm border px-1.5 py-0.5 text-2xs ${
                on
                  ? 'border-ledger bg-ledger text-[color:var(--paper)]'
                  : 'border-rule text-muted hover:bg-[color:var(--ledger-soft)]'
              }`}
            >
              {QUICK_LABELS[q]}
            </button>
          );
        })}

        <label class="ml-2 flex items-center gap-1">
          <span class="sr-only">Filter by category</span>
          <select
            value=""
            onChange={(e) => {
              const value = (e.target as HTMLSelectElement).value as Category;
              if (value) onChange(toggle(state, 'categories', value));
              (e.target as HTMLSelectElement).value = '';
            }}
            class="rounded-sm border border-rule bg-card px-1 py-0.5 text-2xs text-muted"
          >
            <option value="">Category…</option>
            {categories.map((c) => (
              <option key={c} value={c} disabled={state.categories.includes(c)}>
                {c === 'Other' ? 'Uncategorised' : c}
              </option>
            ))}
          </select>
        </label>

        {windowIds.length > 1 && (
          <label class="flex items-center gap-1">
            <span class="sr-only">Filter by window</span>
            <select
              value=""
              onChange={(e) => {
                const value = Number((e.target as HTMLSelectElement).value);
                if (Number.isFinite(value) && value) onChange(toggle(state, 'windows', value));
                (e.target as HTMLSelectElement).value = '';
              }}
              class="rounded-sm border border-rule bg-card px-1 py-0.5 text-2xs text-muted"
            >
              <option value="">Window…</option>
              {windowIds.map((id, i) => (
                <option key={id} value={String(id)} disabled={state.windows.includes(id)}>
                  Window {i + 1} ({tabs.filter((t) => t.windowId === id).length})
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {!isEmpty(state) && (
        <div
          class="flex flex-wrap items-center gap-1 border-t border-rule bg-card px-3 py-1.5"
          role="status"
          aria-live="polite"
        >
          <span class="num mr-1 text-2xs text-muted">
            {matchCount.toLocaleString()} of {totalCount.toLocaleString()} tabs
          </span>
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => onChange(toggle(state, chip.dimension, chip.value as never))}
              aria-label={`Remove filter: ${chip.label}`}
              class="flex items-center gap-1 rounded-sm border border-ledger bg-[color:var(--ledger-soft)] px-1.5 py-0.5 text-2xs text-ledger hover:opacity-80"
            >
              {chip.label}
              <span aria-hidden="true">×</span>
            </button>
          ))}
          <Button onClick={() => onChange(clearAll())} class="ml-1">
            Clear {countActive(state)}
          </Button>
        </div>
      )}
    </div>
  );
}
