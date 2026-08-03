import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { undoOperation } from '@/services/undo.service';

/** The toast persists for 10 seconds, per the brief — long enough to notice and act. */
export const TOAST_MS = 10_000;

export type Toast = {
  message: string;
  undoId: string | null;
  warning?: string | undefined;
};

export function useToast(onUndone?: () => void) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const clear = useCallback(() => {
    if (timer.current !== undefined) clearTimeout(timer.current);
    setToast(null);
  }, []);

  const show = useCallback((next: Toast) => {
    if (timer.current !== undefined) clearTimeout(timer.current);
    setToast(next);
    timer.current = setTimeout(() => setToast(null), TOAST_MS) as unknown as number;
  }, []);

  const undo = useCallback(async () => {
    if (!toast?.undoId) return;
    await undoOperation(toast.undoId);
    clear();
    onUndone?.();
  }, [toast, clear, onUndone]);

  useEffect(() => () => {
    if (timer.current !== undefined) clearTimeout(timer.current);
  }, []);

  return { toast, show, clear, undo };
}
