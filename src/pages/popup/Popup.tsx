import { useState } from 'preact/hooks';
import { useDebt } from '@/hooks/useDebt';
import { useToast } from '@/hooks/useToast';
import { BalanceBar } from '@/components/ui/BalanceBar';
import { SuggestionRow } from '@/components/ui/SuggestionRow';
import { Toast } from '@/components/ui/Toast';
import { Button, Empty, Spinner } from '@/components/ui/primitives';
import { SearchBox } from '@/components/popup/SearchBox';
import { executeAction } from '@/services/actions.service';
import { openDashboard } from '@/services/tabs.service';
import { recordCleanup } from '@/background/snapshot';
import type { Suggestion } from '@/types/suggestion';

/**
 * The triage surface. Search, the balance, the top three actions, and a way out to the
 * dashboard. Nothing else — a 400-tab list cannot breathe in 600px, and everything that
 * needs room lives in the dashboard.
 */
export function Popup() {
  const debt = useDebt();
  const toast = useToast(debt.refresh);
  const [busy, setBusy] = useState(false);

  const run = async (s: Suggestion): Promise<void> => {
    setBusy(true);
    try {
      const result = await executeAction(s.action, debt.input.tabs);
      if (result.affected > 0) await recordCleanup(result.affected);
      toast.show({ message: result.message, undoId: result.undoId, warning: result.warning });
      debt.refresh();
    } finally {
      setBusy(false);
    }
  };

  const top = debt.suggestions.slice(0, 3);

  return (
    <div class="flex h-[600px] w-[400px] flex-col bg-paper">
      <header class="flex items-center justify-between border-b border-rule px-3 py-2">
        <h1 class="text-xs font-semibold uppercase tracking-[0.14em]">Tab Debt</h1>
        <Button onClick={() => void openDashboard().then(() => window.close())}>
          Open dashboard
        </Button>
      </header>

      {debt.loading ? (
        <Spinner label="Reading your tabs…" />
      ) : (
        <>
          <SearchBox index={debt.index} tabs={debt.input.tabs} onChanged={debt.refresh} autoFocus />

          <BalanceBar score={debt.score} tabCount={debt.input.tabs.length} compact />

          <div class="min-h-0 flex-1 overflow-y-auto">
            <h2 class="px-3 py-2 text-2xs uppercase tracking-[0.12em] text-muted">
              Suggested next
            </h2>
            {top.length === 0 ? (
              <Empty title="Nothing worth doing right now.">
                No group of three or more tabs stands out. Your debt is under control.
              </Empty>
            ) : (
              top.map((s) => (
                <SuggestionRow
                  key={s.id}
                  suggestion={s}
                  tabs={debt.input.tabs}
                  onRun={(x) => void run(x)}
                  busy={busy}
                />
              ))
            )}
          </div>
        </>
      )}

      {toast.toast && (
        <Toast toast={toast.toast} onUndo={() => void toast.undo()} onDismiss={toast.clear} />
      )}
    </div>
  );
}
