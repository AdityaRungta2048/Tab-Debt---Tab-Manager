import { useEffect, useState } from 'preact/hooks';
import type { SavedSession } from '@/types/storage';
import type { TabSnapshot } from '@/types/tab';
import {
  listSessions,
  saveSession,
  renameSession,
  deleteSession,
  restoreSession,
  exportSessions,
  importSessions,
  LARGE_SESSION_THRESHOLD,
} from '@/services/sessions.service';
import { Button, Empty } from '@/components/ui/primitives';

/**
 * Named save and restore. Restoring always opens a NEW window, so it never disturbs what
 * the user is currently looking at — and a session above the large threshold asks first,
 * because 200 tabs appearing unannounced is indistinguishable from a bug.
 */
export function SessionsPanel({
  tabs,
  filteredTabs,
  filterActive,
  onChanged,
  onMessage,
}: {
  tabs: TabSnapshot[];
  filteredTabs: TabSnapshot[];
  filterActive: boolean;
  onChanged: () => void;
  onMessage: (message: string, warning?: string) => void;
}) {
  const [sessions, setSessions] = useState<SavedSession[]>([]);
  const [name, setName] = useState('');
  const [saveFiltered, setSaveFiltered] = useState(filterActive);
  const [busy, setBusy] = useState(false);

  const load = (): void => void listSessions().then(setSessions);
  useEffect(load, []);
  useEffect(() => setSaveFiltered(filterActive), [filterActive]);

  const source = saveFiltered ? filteredTabs : tabs;

  const save = async (): Promise<void> => {
    if (source.length === 0) return;
    setBusy(true);
    try {
      const session = await saveSession(name, source);
      setName('');
      load();
      onMessage(`Saved "${session.name}" with ${session.tabs.length} tabs`);
    } finally {
      setBusy(false);
    }
  };

  const restore = async (session: SavedSession): Promise<void> => {
    if (
      session.tabs.length > LARGE_SESSION_THRESHOLD &&
      !confirm(
        `"${session.name}" holds ${session.tabs.length} tabs. Restoring opens all of them in a new window. Continue?`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const result = await restoreSession(session.id);
      onChanged();
      onMessage(
        `Restored ${result.restored} ${result.restored === 1 ? 'tab' : 'tabs'} into a new window`,
        result.failed > 0
          ? `${result.failed} ${result.failed === 1 ? 'tab' : 'tabs'} could not be reopened — Chrome refuses some saved addresses.`
          : undefined,
      );
    } finally {
      setBusy(false);
    }
  };

  const download = async (): Promise<void> => {
    const data = await exportSessions();
    // A local blob URL. Nothing is uploaded — see PRIVACY.md.
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `tab-debt-sessions-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const upload = async (file: File): Promise<void> => {
    const result = await importSessions(await file.text());
    if (result.ok) {
      load();
      onMessage(`Imported ${result.imported} ${result.imported === 1 ? 'session' : 'sessions'}`);
    } else {
      onMessage('Could not import that file', result.error);
    }
  };

  return (
    <div class="min-h-0 flex-1 overflow-y-auto">
      <div class="flex flex-wrap items-center gap-2 border-b border-rule px-3 py-2">
        <label class="min-w-0 flex-1">
          <span class="sr-only">Name for this session</span>
          <input
            type="text"
            value={name}
            onInput={(e) => setName((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void save();
            }}
            placeholder="Name this session"
            class="w-full rounded-sm border border-rule bg-card px-2 py-1 text-xs"
          />
        </label>

        {filterActive && (
          <label class="flex items-center gap-1 text-2xs text-muted">
            <input
              type="checkbox"
              checked={saveFiltered}
              onChange={(e) => setSaveFiltered((e.target as HTMLInputElement).checked)}
              class="accent-[color:var(--ledger)]"
            />
            Filtered only
          </label>
        )}

        <Button variant="primary" onClick={() => void save()} disabled={busy || source.length === 0}>
          Save {source.length} {source.length === 1 ? 'tab' : 'tabs'}
        </Button>
        <Button onClick={() => void download()} disabled={sessions.length === 0}>
          Export
        </Button>
        {/* The native file input is styled inconsistently across platforms and looked
            out of place beside the hand-rolled buttons. The input is visually hidden but
            still focusable and labelled, so keyboard and screen-reader use is unchanged. */}
        <label class="inline-flex h-6 cursor-pointer items-center rounded-sm border border-rule px-2 text-xs font-medium hover:bg-[color:var(--ledger-soft)] focus-within:outline focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-[color:var(--ledger)]">
          Import
          <input
            type="file"
            accept="application/json,.json"
            onChange={(e) => {
              const file = (e.target as HTMLInputElement).files?.[0];
              if (file) void upload(file);
              (e.target as HTMLInputElement).value = '';
            }}
            class="sr-only"
          />
        </label>
      </div>

      {sessions.length === 0 ? (
        <Empty title="No saved sessions yet.">
          Save the tabs you are looking at now, then close them without losing them.
        </Empty>
      ) : (
        sessions.map((session) => (
          <div key={session.id} class="td-row flex items-center gap-3 px-3 py-2">
            <div class="min-w-0 flex-1">
              <input
                type="text"
                value={session.name}
                aria-label={`Rename ${session.name}`}
                onBlur={(e) => {
                  const next = (e.target as HTMLInputElement).value;
                  if (next !== session.name) void renameSession(session.id, next).then(load);
                }}
                class="w-full truncate bg-transparent text-xs font-medium outline-none hover:underline focus:underline"
              />
              <p class="num mt-0.5 text-2xs text-muted">
                {session.tabs.length} {session.tabs.length === 1 ? 'tab' : 'tabs'} ·{' '}
                {new Date(session.createdAt).toLocaleDateString()}
                {session.tabs.length > LARGE_SESSION_THRESHOLD && ' · large'}
              </p>
            </div>
            <Button variant="primary" onClick={() => void restore(session)} disabled={busy}>
              Restore
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (confirm(`Delete "${session.name}"? The tabs it holds are not affected.`)) {
                  void deleteSession(session.id).then(load);
                }
              }}
            >
              Delete
            </Button>
          </div>
        ))
      )}
    </div>
  );
}
