import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Categorization, TabSnapshot } from '@/types/tab';
import { activateTab, faviconUrl } from '@/services/tabs.service';
import { bucketFor, formatAge, formatAgeCompact } from '@/core/staleness/buckets';
import { estimateTabMb } from '@/core/memory/estimate';
import { CategoryChip, Estimated } from '@/components/ui/primitives';
import type { MemoryWeights } from '@/core/memory/estimate';

/**
 * The register: dense 28px hairline-ruled rows, numeric columns right-aligned in the
 * numeric face so they scan vertically like a statement.
 *
 * Virtualised, because mounting 800 row subtrees is how a dashboard takes three seconds to
 * become interactive. Only the visible window plus a small overscan is in the DOM.
 */

const ROW_H = 28;
const OVERSCAN = 12;

export function Register({
  tabs,
  categories,
  weights,
  selected,
  onToggle,
  onToggleAll,
  now,
}: {
  tabs: TabSnapshot[];
  categories: Map<TabSnapshot, Categorization>;
  weights: MemoryWeights;
  selected: Set<number>;
  onToggle: (id: number, shiftKey: boolean) => void;
  onToggleAll: () => void;
  now: number;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(600);

  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setHeight(el.clientHeight));
    observer.observe(el);
    setHeight(el.clientHeight);
    return () => observer.disconnect();
  }, []);

  const { start, end, offset } = useMemo(() => {
    const first = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
    const visible = Math.ceil(height / ROW_H) + OVERSCAN * 2;
    return { start: first, end: Math.min(tabs.length, first + visible), offset: first * ROW_H };
  }, [scrollTop, height, tabs.length]);

  const allSelected = tabs.length > 0 && tabs.every((t) => selected.has(t.id));

  return (
    <div class="flex min-h-0 flex-1 flex-col">
      {/* Column headers, in the statement idiom: quiet, ruled, right-aligned numerics. */}
      <div class="flex h-7 shrink-0 items-center gap-2 border-b border-rule bg-card px-3 text-2xs uppercase tracking-[0.1em] text-muted">
        <input
          type="checkbox"
          checked={allSelected}
          onChange={onToggleAll}
          aria-label={allSelected ? 'Deselect all tabs' : 'Select all tabs'}
          class="shrink-0 accent-[color:var(--ledger)]"
        />
        <span class="flex-1">Tab</span>
        <span class="w-32 shrink-0">Site</span>
        <span class="w-24 shrink-0">Category</span>
        <span class="w-24 shrink-0 text-right" title="A leading ~ means the age was inferred from Chrome's own record rather than observed by Tab Debt.">
          Last used
        </span>
        <span class="w-24 shrink-0 text-right" title="Chrome exposes no per-tab memory API, so every size here is an estimate from an editable heuristic.">
          Size (est.)
        </span>
      </div>

      <div
        ref={viewport}
        class="min-h-0 flex-1 overflow-y-auto"
        onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
        role="grid"
        aria-rowcount={tabs.length}
        aria-label="Open tabs"
      >
        <div style={{ height: `${tabs.length * ROW_H}px`, position: 'relative' }}>
          <div style={{ transform: `translateY(${offset}px)` }}>
            {tabs.slice(start, end).map((tab, i) => {
              const cat = categories.get(tab);
              const bucket = bucketFor(tab, now);
              const isSelected = selected.has(tab.id);
              return (
                <div
                  key={tab.id}
                  role="row"
                  aria-rowindex={start + i + 1}
                  aria-selected={isSelected}
                  class={`td-row flex h-row items-center gap-2 px-3 ${isSelected ? 'bg-[color:var(--ledger-soft)]' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onClick={(e) => onToggle(tab.id, (e as MouseEvent).shiftKey)}
                    onChange={() => undefined}
                    aria-label={`Select ${tab.title || tab.url}`}
                    class="shrink-0 accent-[color:var(--ledger)]"
                  />
                  <img
                    src={faviconUrl(tab.url)}
                    alt=""
                    width={14}
                    height={14}
                    class="shrink-0 rounded-sm"
                    loading="lazy"
                  />
                  <button
                    type="button"
                    onClick={() => void activateTab(tab.id)}
                    class="min-w-0 flex-1 truncate text-left text-xs hover:underline"
                    title={tab.title || tab.url}
                  >
                    {tab.title || tab.url}
                    {tab.pinned && <span class="ml-1 text-2xs text-faint">pinned</span>}
                    {tab.audible && <span class="ml-1 text-2xs text-faint">audio</span>}
                    {tab.discarded && <span class="ml-1 text-2xs text-faint">asleep</span>}
                  </button>
                  <span class="num w-32 shrink-0 truncate text-2xs text-muted">{tab.domain || '—'}</span>
                  <span class="w-24 shrink-0">
                    {cat && <CategoryChip label={cat.category} reason={cat.reason} />}
                  </span>
                  <span
                    class={`num w-24 shrink-0 truncate text-right text-2xs ${bucket === 'never' || bucket === '30days' ? 'text-warn' : 'text-muted'}`}
                    title={formatAge(tab, now)}
                  >
                    <span class="sr-only">{formatAge(tab, now)}</span>
                    <span aria-hidden="true">{formatAgeCompact(tab, now)}</span>
                  </span>
                  <span class="w-24 shrink-0 text-right">
                    <Estimated mb={estimateTabMb(tab, weights)} labelledByColumn />
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
