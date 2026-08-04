# ARCHITECTURE

## The one rule

```
core/  ──────────► plain data in, plain data out. Never imports chrome.*
   ▲
   │
services/ ───────► the ONLY layer that touches chrome.*
   ▲
   │
components/, pages/, background/
```

`src/core/` contains every piece of logic worth testing — categorisation, duplicate
detection, the debt score, staleness, suggestions, search, memory estimation — and it
imports nothing from Chrome, the DOM, or the UI. It takes plain objects and returns plain
objects.

This is enforced, not merely intended. `.eslintrc.cjs` applies `no-restricted-imports` and
`no-restricted-globals` to `src/core/**`, so referencing `chrome`, `window`, `document`, or
anything under `services/`, `background/`, `hooks/` or `components/` fails the build.

**Why it matters:** it is what makes the 800-tab fixture possible. The entire domain runs in
Node in milliseconds, so the debt score can be tested at its boundaries, the duplicate
clusterer can be run against a generated 800-tab set, and search can be measured against a
16ms budget — none of which is practical if the logic is entangled with a live browser.

## Layers

| Layer | Responsibility | May import |
|---|---|---|
| `core/` | All domain logic. Pure functions. | Other `core/`, `types/` |
| `services/` | Chrome adapter. Reads/writes `chrome.*`, validates storage. | `core/`, `types/` |
| `background/` | Service worker: event listeners, alarms, snapshots. | `services/`, `core/` |
| `hooks/`, `components/`, `pages/` | UI. | anything below |
| `test/` | Fixture generator and `chrome.*` mock. | `core/`, `types/` |

No file exceeds 300 lines; `max-lines` enforces it. A file past that is doing two jobs.

## Data model

`core/` operates on `TabSnapshot` — a plain record with no Chrome types and no class
instances:

```ts
type TabSnapshot = {
  id, url, title, domain, windowId, index, groupId,
  pinned, audible, muted, discarded, active,
  lastActiveAt: number | null,      // null = never activated
  lastActiveInferred: boolean,      // true => render "(estimated)"
  createdAt,
}
```

The debt score takes exactly one input, which is why it is testable at the boundaries:

```ts
type DebtInput = { tabs: TabSnapshot[]; windowCount: number; now: number; baseline: number }
```

`now` lives in the snapshot rather than being read from the clock inside the scoring
function. A function that reads the clock cannot be tested at a boundary.

### Conversion

`core/snapshot.ts` converts a Chrome-*shaped* record into a `TabSnapshot`. It takes the
shape, never the API, so the fixture exercises the real conversion path rather than
sidestepping it. It also encodes the staleness-honesty rule:

1. An activity record we observed ourselves wins.
2. Otherwise `tabs.lastAccessed`, marked `inferred: true` — we did not watch it, so we do
   not claim to have.
3. Otherwise `null` — never activated.
4. The active tab is active *now*, whatever any stored record says.

### Persisted state

Every key is Zod-validated on read with a schema version and defaults, because stored shapes
drift and an unvalidated read is how an extension bricks itself for its longest-standing
user. A corrupt or future-versioned record degrades to working defaults with a console
warning; it never throws into a render.

| Key | Growth bound |
|---|---|
| `td.settings.v1` | Fixed |
| `td.activity.v1` | Live tabs + 30-day TTL, pruned on an alarm |
| `td.undo.v1` | 10 operations **and** a 1MB ceiling |
| `td.archive.v1` | User-driven |
| `td.daily.v1` | 180 rows, one per day — never per-event |
| `td.sessions.v1` | User-driven |

A storage-budget test simulates a year of daily aggregates plus 800 activity records plus a
full undo stack plus 500 overrides and asserts the total stays under **half** the ~10MB
quota.

## The ephemeral service worker

MV3 terminates the worker aggressively. The whole background layer is written on the
assumption that it dies between any two lines, and that any listener may be the first thing
to run after a cold start.

- **No module-level mutable state, anywhere.** Every handler is read-storage → compute →
  write-storage.
- **Every write goes through `mutate()`**, which re-reads immediately before writing. Not a
  transaction — `chrome.storage` offers none — but it closes the window where a restart
  between read and write clobbers a concurrent update.
- **`chrome.alarms`, never `setTimeout`.** Timers do not survive termination. Alarms are
  re-created on install, on startup, and on every cold start, since `onInstalled` and
  `onStartup` do not fire when the worker is merely revived to service an event.
- **Listeners register synchronously at the top level.** A listener registered inside an
  async callback is missed on the very wake that needed it.

`src/background/background.test.ts` drops all module state between events — the closest
available analogue to Chrome terminating the worker — and asserts outcomes are unchanged. A
cache anywhere in this layer fails it.

## Undo

The trust proposition. `chrome.sessions.restore` is deliberately unused: it is per-item and
lossy and cannot do a 100-tab bulk undo.

Instead: snapshot before destroying (url, title, pinned, windowId, index, groupId, muted,
active), then rebuild via `chrome.tabs.create` and re-apply pinned state, window placement,
mute and group membership. Group *titles* are captured at snapshot time, because an emptied
group ceases to exist and its name becomes unrecoverable.

Restore is best-effort by design: a window may have been closed since, and refusing to
restore anything because one target is missing would be worse than restoring 99 of 100 and
reporting the relocation. The UI states plainly what undo cannot bring back — scroll
position, form contents, page history.

All bulk actions funnel through `services/actions.service.ts`, so there is exactly one place
the snapshot-before-destroy rule can be got wrong, and it is enforced by ordering.

## The dashboard is a tab

Handled explicitly rather than incidentally: `getSnapshot()` filters out any tab whose URL
starts with the extension's own origin. The dashboard is excluded from every count, score,
suggestion and bulk action — otherwise the product inflates the number it exists to reduce,
and could close itself mid-operation. Opening it reuses an existing dashboard tab.

## Rendering at 800 rows

The register is virtualised at a fixed 28px row height: only the visible window plus a
12-row overscan is mounted. Search builds its index once and, while the query is merely
being extended, filters the previous *results* rather than rescanning 800 entries — measured
under 16ms per keystroke at 800 tabs.

The debt recompute is debounced by 250ms so a burst of tab events produces one recompute
rather than forty, and the score does not jitter under the user's cursor.
