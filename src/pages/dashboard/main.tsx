import { render } from 'preact';
import '@/styles/tokens.css';
import { Dashboard } from './Dashboard';
import { applyStoredTheme } from '@/hooks/useTheme';

async function boot(): Promise<void> {
  // Dev only: install the in-memory chrome so the dashboard runs in a plain tab with no
  // extension installed. The import is inside the guard so it never reaches the crx bundle.
  if (__MOCK__) {
    const { installMockChrome } = await import('@/test/mocks/chrome');
    const params = new URLSearchParams(location.search);
    const size = Number(params.get('fixture') ?? 400);
    const mock = installMockChrome(Number.isFinite(size) ? size : 400);

    // Seed the daily roll-up too. The real one is written by an alarm that never fires in
    // a plain browser tab, so without this the trends view could only be reviewed by
    // imagining it — which is the exact failure the fixture harness exists to prevent.
    const { generateHistory } = await import('@/test/fixtures/history');
    const { KEYS, SCHEMA_VERSION } = await import('@/types/storage');
    await mock.storage.local.set({
      [KEYS.daily]: {
        v: SCHEMA_VERSION,
        rows: generateHistory(90, Date.now(), mock.__tabs().length),
      },
      // Onboarding is shown on demand in the harness (?onboarding=1), not on every reload.
      ...(params.get('onboarding') === '1'
        ? {}
        : { [KEYS.settings]: { v: SCHEMA_VERSION, onboarded: true } }),
    });
  }

  await applyStoredTheme();
  const root = document.getElementById('root');
  if (root) render(<Dashboard />, root);
}

void boot();
