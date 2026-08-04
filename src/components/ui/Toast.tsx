import { Button } from './primitives';
import { UNDO_CANNOT_RESTORE } from '@/services/undo.service';
import type { Toast as ToastData } from '@/hooks/useToast';

/**
 * The toast is where the promise of reversibility is kept. It states what happened in past
 * tense, offers Undo for a full ten seconds, and is explicit that undo cannot bring back
 * scroll position, form contents or page history — discovering that later is how trust is
 * lost.
 */
export function Toast({
  toast,
  onUndo,
  onDismiss,
}: {
  toast: ToastData;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      class="td-toast fixed bottom-3 left-1/2 z-50 w-[min(30rem,calc(100vw-1.5rem))] -translate-x-1/2 rounded border border-rule bg-card p-3"
      role="status"
      aria-live="polite"
    >
      <div class="flex items-start gap-3">
        <div class="min-w-0 flex-1">
          <p class="text-sm font-medium">{toast.message}</p>
          {toast.warning && <p class="mt-1 text-xs text-warn">{toast.warning}</p>}
          {toast.undoId && (
            <p class="mt-0.5 text-2xs text-muted">{UNDO_CANNOT_RESTORE} cannot be restored.</p>
          )}
        </div>
        <div class="flex shrink-0 items-center gap-1.5">
          {toast.undoId && (
            <Button variant="primary" onClick={onUndo}>
              Undo
            </Button>
          )}
          <Button onClick={onDismiss} aria-label="Dismiss notification">
            Dismiss
          </Button>
        </div>
      </div>
    </div>
  );
}
