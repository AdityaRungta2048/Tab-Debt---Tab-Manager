import { useCallback, useMemo, useRef, useState } from 'preact/hooks';
import { useDebt } from '@/hooks/useDebt';
import { useToast } from '@/hooks/useToast';
import { BalanceBar } from '@/components/ui/BalanceBar';
import { SuggestionRow } from '@/components/ui/SuggestionRow';
import { Toast } from '@/components/ui/Toast';
import { Button, Spinner, Stat } from '@/components/ui/primitives';
import { Register } from '@/components/dashboard/Register';
import { DuplicatesPanel } from '@/components/dashboard/DuplicatesPanel';
import { HistoryPanel } from '@/components/dashboard/HistoryPanel';
import { SearchBox } from '@/components/popup/SearchBox';
import { FilterBar } from '@/components/dashboard/FilterBar';
import { DomainView } from '@/components/dashboard/DomainView';
import { SessionsPanel } from '@/components/dashboard/SessionsPanel';
import {
  applyFilters,
  isEmpty as noFilters,
  EMPTY_FILTERS,
  type FilterState,
} from '@/core/filters/filters';
import { findDuplicates } from '@/core/duplicates/cluster';
import { executeAction } from '@/services/actions.service';
import { recordCleanup } from '@/background/snapshot';
import { summarise } from '@/core/staleness/buckets';
import { estimateTotalMb } from '@/core/memory/estimate';
import type { ScoreFactorId, Suggestion } from '@/types/suggestion';
import { FixtureSwitcher } from './FixtureSwitcher';

type Tab = 'register' | 'domains' | 'duplicates' | 'sessions' | 'history';

/**
 * The dashboard: account summary on the left, register on the right. The left rail is the
 * statement header — balance, factor breakdown, then the numbers that back it up.
 */
export function Dashboard() {
  const debt = useDebt();
  const toast = useToast(debt.refresh);
  const [panel, setPanel] = useState<Tab>('register');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const lastToggled = useRef<number | null>(null);

  // Duplicate ids are needed by the "Duplicates" quick filter and are expensive enough at
  // 800 tabs to be worth memoising on the snapshot rather than recomputing per keystroke.
  const duplicateIds = useMemo(
    () =>
      new Set(
        findDuplicates(debt.input.tabs, {
          ...(debt.settings.trackingParams.length
            ? { trackingParams: debt.settings.trackingParams }
            : {}),
        }).flatMap((c) => c.close.map((t) => t.id)),
      ),
    [debt.input.tabs, debt.settings.trackingParams],
  );

  const filterCtx = useMemo(
    () => ({ now: debt.input.now, duplicateIds, categoryOf: debt.categoryOf }),
    [debt.input.now, duplicateIds, debt.categoryOf],
  );

  // Every view below works off the FILTERED list, so filters compose with domain rollup,
  // bulk selection and session saving rather than only narrowing the register.
  const visibleTabs = useMemo(
    () => applyFilters(debt.input.tabs, filters, filterCtx),
    [debt.input.tabs, filters, filterCtx],
  );

  const stale = useMemo(() => summarise(debt.input.tabs, debt.input.now), [debt.input]);
  const totalMb = useMemo(
    () => estimateTotalMb(debt.input.tabs, debt.settings.memoryWeights),
    [debt.input.tabs, debt.settings.memoryWeights],
  );

  const act = useCallback(
    async (action: Parameters<typeof executeAction>[0]): Promise<void> => {
      setBusy(true);
      try {
        const result = await executeAction(action, debt.input.tabs);
        if (result.affected > 0) await recordCleanup(result.affected);
        toast.show({ message: result.message, undoId: result.undoId, warning: result.warning });
        setSelected(new Set());
        debt.refresh();
      } finally {
        setBusy(false);
      }
    },
    [debt, toast],
  );

  const runSuggestion = (s: Suggestion): void => void act(s.action);

  /** Shift-click selects a range, the way every list of 800 things should. */
  const toggle = useCallback(
    (id: number, shiftKey: boolean) => {
      setSelected((prev) => {
        const next = new Set(prev);
        const ids = visibleTabs.map((t) => t.id);
        if (shiftKey && lastToggled.current !== null) {
          const from = ids.indexOf(lastToggled.current);
          const to = ids.indexOf(id);
          if (from !== -1 && to !== -1) {
            for (const x of ids.slice(Math.min(from, to), Math.max(from, to) + 1)) next.add(x);
            return next;
          }
        }
        if (next.has(id)) next.delete(id);
        else next.add(id);
        lastToggled.current = id;
        return next;
      });
    },
    [visibleTabs],
  );

  const toggleAll = useCallback(() => {
    setSelected((prev) =>
      prev.size === visibleTabs.length ? new Set() : new Set(visibleTabs.map((t) => t.id)),
    );
  }, [visibleTabs]);

  /** Clicking a Balance Bar segment jumps to that factor's remedy. */
  const onFactor = useCallback(
    (id: ScoreFactorId) => {
      if (id === 'duplicates') {
        setPanel('duplicates');
        return;
      }
      const factor = debt.score.factors.find((f) => f.id === id);
      if (factor) {
        setPanel('register');
        // Clear filters first: selecting tabs the active filter is hiding would look like
        // the remedy silently did nothing.
        setFilters(EMPTY_FILTERS);
        setSelected(new Set(factor.tabIds));
      }
    },
    [debt.score.factors],
  );

  const ids = [...selected];

  if (debt.loading) return <Spinner label="Reading your tabs…" />;

  return (
    <div class="flex h-screen bg-paper">
      <aside class="flex w-[280px] shrink-0 flex-col overflow-y-auto border-r border-rule">
        <div class="flex items-center justify-between px-4 py-3">
          <h1 class="text-xs font-semibold uppercase tracking-[0.14em]">Tab Debt</h1>
          {__MOCK__ && <FixtureSwitcher />}
        </div>

        <BalanceBar score={debt.score} tabCount={debt.input.tabs.length} onFactor={onFactor} />

        <div class="grid grid-cols-2 gap-3 border-b border-rule px-4 py-3">
          <Stat value={stale.neverOpened} label="Never opened" />
          <Stat value={stale.counts['30days']} label="30+ days old" />
          <Stat value={debt.input.windowCount} label="Windows" />
          <Stat value={`~${totalMb > 1024 ? `${(totalMb / 1024).toFixed(1)}GB` : `${totalMb}MB`}`} label="Est. size" />
        </div>

        <div class="px-4 py-3">
          <h2 class="text-2xs uppercase tracking-[0.12em] text-muted">Suggested next</h2>
        </div>
        <div class="border-t border-rule">
          {debt.suggestions.map((s) => (
            <SuggestionRow
              key={s.id}
              suggestion={s}
              tabs={debt.input.tabs}
              onRun={runSuggestion}
              busy={busy}
            />
          ))}
          {debt.suggestions.length === 0 && (
            <p class="px-4 py-6 text-xs text-muted">
              Nothing stands out. No group of three or more tabs is worth acting on.
            </p>
          )}
        </div>
      </aside>

      <main class="flex min-w-0 flex-1 flex-col">
        <SearchBox index={debt.index} tabs={debt.input.tabs} onChanged={debt.refresh} maxResults={60} />

        <nav class="flex items-center gap-1 border-b border-rule px-3 py-1.5" aria-label="Views">
          {(['register', 'domains', 'duplicates', 'sessions', 'history'] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setPanel(t)}
              aria-current={panel === t ? 'page' : undefined}
              class={`rounded-sm px-2 py-1 text-xs capitalize ${panel === t ? 'bg-ledger text-[color:var(--paper)]' : 'text-muted hover:bg-[color:var(--ledger-soft)]'}`}
            >
              {t}
            </button>
          ))}
        </nav>

        {selected.size > 0 && (
          <div class="flex items-center gap-2 border-b border-rule bg-card px-3 py-2">
            <span class="num text-xs font-medium">{selected.size} selected</span>
            <div class="ml-auto flex gap-1.5">
              <Button onClick={() => void act({ kind: 'group', tabIds: ids, title: 'Collected' })} disabled={busy}>
                Group
              </Button>
              <Button onClick={() => void act({ kind: 'bookmarkAndClose', tabIds: ids, folder: 'Selection' })} disabled={busy}>
                Bookmark and close
              </Button>
              <Button onClick={() => void act({ kind: 'archive', tabIds: ids })} disabled={busy}>
                Archive
              </Button>
              <Button variant="danger" onClick={() => void act({ kind: 'close', tabIds: ids })} disabled={busy}>
                Close {selected.size}
              </Button>
              <Button onClick={() => setSelected(new Set())}>Clear</Button>
            </div>
          </div>
        )}

        {(panel === 'register' || panel === 'domains') && (
          <FilterBar
            state={filters}
            onChange={(next) => {
              setFilters(next);
              setSelected(new Set());
            }}
            tabs={debt.input.tabs}
            categoryOf={debt.categoryOf}
            matchCount={visibleTabs.length}
            totalCount={debt.input.tabs.length}
          />
        )}

        {panel === 'register' && (
          <Register
            tabs={visibleTabs}
            categories={debt.categories}
            weights={debt.settings.memoryWeights}
            selected={selected}
            onToggle={toggle}
            onToggleAll={toggleAll}
            now={debt.input.now}
          />
        )}
        {panel === 'domains' && (
          <DomainView
            tabs={visibleTabs}
            categoryOf={debt.categoryOf}
            weights={debt.settings.memoryWeights}
            now={debt.input.now}
            onAction={(action) => void act(action)}
            busy={busy}
          />
        )}
        {panel === 'sessions' && (
          <SessionsPanel
            tabs={debt.input.tabs}
            filteredTabs={visibleTabs}
            filterActive={!noFilters(filters)}
            onChanged={debt.refresh}
            onMessage={(message, warning) =>
              toast.show({ message, undoId: null, ...(warning ? { warning } : {}) })
            }
          />
        )}
        {panel === 'duplicates' && (
          <DuplicatesPanel
            tabs={debt.input.tabs}
            strategy={debt.settings.keepStrategy}
            trackingParams={debt.settings.trackingParams}
            onClose={(tabIds) => void act({ kind: 'close', tabIds })}
            busy={busy}
          />
        )}
        {panel === 'history' && <HistoryPanel onUndone={debt.refresh} />}
      </main>

      {toast.toast && (
        <Toast toast={toast.toast} onUndo={() => void toast.undo()} onDismiss={toast.clear} />
      )}
    </div>
  );
}
