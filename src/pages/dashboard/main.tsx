import { render } from 'preact';
import '@/styles/tokens.css';
import { Dashboard } from './Dashboard';
import { applyStoredTheme } from '@/hooks/useTheme';

async function boot(): Promise<void> {
  // Dev only: install the in-memory chrome so the dashboard runs in a plain tab with no
  // extension installed. The import is inside the guard so it never reaches the crx bundle.
  if (__MOCK__) {
    const { installMockChrome } = await import('@/test/mocks/chrome');
    const size = Number(new URLSearchParams(location.search).get('fixture') ?? 400);
    installMockChrome(Number.isFinite(size) ? size : 400);
  }

  await applyStoredTheme();
  const root = document.getElementById('root');
  if (root) render(<Dashboard />, root);
}

void boot();
