import { useCallback, useEffect, useState } from 'preact/hooks';
import { read, update } from '@/services/storage.service';
import type { Settings } from '@/types/storage';

export type Theme = Settings['theme'];

/**
 * System preference by default, with a manual override. Applied to the root element as a
 * data attribute so the CSS custom properties switch without a re-render.
 */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}

/** Called before first paint so the popup never flashes the wrong theme. */
export async function applyStoredTheme(): Promise<void> {
  try {
    applyTheme((await read.settings()).theme);
  } catch {
    applyTheme('system');
  }
}

export function useTheme(): { theme: Theme; setTheme: (t: Theme) => void } {
  const [theme, setLocal] = useState<Theme>('system');

  useEffect(() => {
    void read.settings().then((s) => {
      setLocal(s.theme);
      applyTheme(s.theme);
    });
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setLocal(next);
    applyTheme(next);
    void update.settings((s) => ({ ...s, theme: next }));
  }, []);

  return { theme, setTheme };
}
