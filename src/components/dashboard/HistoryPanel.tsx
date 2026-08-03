import { useEffect, useState } from 'preact/hooks';
import { undoHistory, undoOperation, clearUndoHistory, UNDO_CANNOT_RESTORE } from '@/services/undo.service';
import type { UndoOp } from '@/types/storage';
import { Button, Empty } from '@/components/ui/primitives';
import { formatDuration } from '@/core/staleness/buckets';

/**
 * Undo lives permanently here, not only in a toast — people notice their mistake two
 * minutes later, not two seconds later, and by then the toast is long gone.
 */
export function HistoryPanel({ onUndone }: { onUndone: () => void }) {
  const [ops, setOps] = useState<UndoOp[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = (): void => void undoHistory().then(setOps);
  useEffect(load, []);

  const undo = async (id: string): Promise<void> => {
    setBusy(id);
    try {
      const result = await undoOperation(id);
      load();
      onUndone();
      if (result.relocated > 0) {
        // Silent relocation would be a small lie about what was restored.
        console.warn(`[tab-debt] ${result.relocated} tabs went to a different window`);
      }
    } finally {
      setBusy(null);
    }
  };

  if (ops.length === 0) {
    return <Empty title="No history yet.">Anything you close here can be undone from this panel.</Empty>;
  }

  return (
    <div class="min-h-0 flex-1 overflow-y-auto">
      <div class="flex items-center justify-between border-b border-rule px-3 py-2">
        <p class="text-2xs text-muted">
          The last {ops.length} operations. {UNDO_CANNOT_RESTORE} cannot be restored.
        </p>
        <Button onClick={() => void clearUndoHistory().then(load)}>Clear</Button>
      </div>

      {ops.map((op) => (
        <div key={op.id} class="td-row flex items-center gap-3 px-3 py-2">
          <div class="min-w-0 flex-1">
            <p class="truncate text-xs font-medium">{op.label}</p>
            <p class="num mt-0.5 text-2xs text-muted">
              {formatDuration(Date.now() - op.at)} · {op.tabs.length} {op.tabs.length === 1 ? 'tab' : 'tabs'}
              {op.undone && ' · restored'}
            </p>
          </div>
          <Button
            variant={op.undone ? 'quiet' : 'primary'}
            disabled={op.undone || busy === op.id}
            onClick={() => void undo(op.id)}
            class="shrink-0"
          >
            {op.undone ? 'Restored' : busy === op.id ? 'Restoring…' : 'Undo'}
          </Button>
        </div>
      ))}
    </div>
  );
}
