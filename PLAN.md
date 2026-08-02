# PLAN

Written before any code. Revised only with a dated note appended, never silently.

## 1. Thesis restated in engineering terms

The product is a **pure function pipeline over tab metadata**, wrapped in the thinnest
possible Chrome adapter, with a **reversible mutation layer**.

```
chrome.tabs.query()  ->  TabSnapshot[]  ->  core/*  ->  Debt view model
                                                              |
                                        user picks an action  v
                          UndoSnapshot  <-  services/*  <-  Action
```

Everything valuable lives in `core/`, which never imports `chrome.*`. That is what makes
a 400-tab fixture possible without a browser, and it is the reason the test suite is the
primary development surface rather than an afterthought.

## 2. Phases and gates

### Phase 0 — harness (built FIRST, before any feature)

The brief is explicit and correct: you cannot manually open 400 tabs. Building features
before the harness means every feature is validated by eyeball at 5 tabs.

- `src/test/fixtures/generate.ts` — deterministic (seeded PRNG) tab-set generator at
  50 / 200 / 400 / 800.
- `src/test/mocks/chrome.ts` — in-memory `chrome.*` implementing exactly the surface we
  use: `tabs`, `tabGroups`, `windows`, `storage.local`, `alarms`, `bookmarks`, `runtime`.
- `src/mock/install.ts` — dev-only entry that installs the mock onto `globalThis` so the
  dashboard runs under `vite dev` in a plain tab, plus a fixture switcher in the UI.

Exit gate: `vitest run` green with a smoke test that asserts the 800-tab fixture has the
declared distribution (duplicate clusters present at all three tiers, every staleness
bucket populated, >1 window, pinned/audible/discarded present).

### Phase 1 — the shippable core

Order chosen so each step is testable against the previous one:

1. `types/` + Zod schemas + storage migration scaffold
2. `core/categorize` — rule table (data file) + classifier + 60-case table test
3. `core/staleness` — bucketing with boundary tests
4. `core/duplicates` — canonicalization + three-tier clustering
5. `core/score` — pure snapshot -> score + factor breakdown
6. `core/suggest` — typed suggestions, ranked
7. `services/` — tabs, storage, bookmarks, undo stack
8. `background/` — alarms, lastSeenActive map, snapshot writer
9. `pages/popup` — search, score chip, top 3 actions, undo toast
10. `pages/dashboard` — register, duplicates review, bulk actions, history

Exit gate: section 8 loop, plus `CRITIQUE.md` with two fixes landed.

### Phase 2 — depth
Domain grouping, composable filters, sessions, settings.

### Phase 3 — polish
Rolled-up analytics, CSV export, streak, command shortcut, 3-screen onboarding.

## 3. File tree (target)

```
src/
  background/index.ts, alarms.ts, activity.ts, snapshot.ts
  core/
    categorize/{rules.data.ts, classify.ts, index.ts}
    duplicates/{canonical.ts, cluster.ts, index.ts}
    score/{score.ts, factors.ts, index.ts}
    staleness/{buckets.ts, index.ts}
    suggest/{templates.ts, rank.ts, index.ts}
    memory/estimate.ts
  services/{tabs,storage,bookmarks,undo,sessions}.service.ts
  hooks/{useTabs,useDebt,useSearch,useToast,useTheme}.ts
  components/ui/*, components/dashboard/*, components/popup/*
  pages/{popup,dashboard,options}/
  types/{tab.ts, storage.ts, suggestion.ts, index.ts}
  test/{fixtures/, mocks/}
scripts/{check-bundle-size.mjs, check-no-network.mjs}
```

No file over 300 lines. Enforced by a lint rule (`max-lines`), not by intention.

## 4. Data model

```ts
// The unit core/ operates on. Plain data. No chrome types.
type TabSnapshot = {
  id: number; url: string; title: string; domain: string;
  windowId: number; index: number; groupId: number;
  pinned: boolean; audible: boolean; muted: boolean; discarded: boolean;
  active: boolean;
  lastActiveAt: number | null;   // ms epoch, null = never activated
  lastActiveInferred: boolean;   // true => render "(estimated)"
  createdAt: number;
}

type DebtSnapshot = {           // the ONLY input to the score fn
  tabs: TabSnapshot[]; windows: number; now: number; baseline: number;
}
```

Persisted (all Zod-validated, all versioned):

| key | shape | growth |
|---|---|---|
| `td.settings.v1` | baseline, theme, weights, overrides, param list | fixed |
| `td.activity.v1` | `Record<activityKey, {lastActiveAt, inferred}>` | bounded by pruning to live tabs + 30d |
| `td.undo.v1` | last 10 operations, each with tab snapshots | capped by count *and* bytes |
| `td.archive.v1` | archived tab metadata | user-driven, prunable |
| `td.daily.v1` | per-day aggregate rows, 180-day window | ~180 small rows, never per-event |
| `td.sessions.v1` | named sessions | user-driven |

`activityKey = tabId + ":" + djb2(url)` — tab IDs are reused by Chrome across restarts, so
the id alone is not a stable key; the URL hash disambiguates.

## 5. The five riskiest unknowns, and how each is de-risked

**R1 — There is no per-tab memory API, and faking one destroys trust.**
`chrome.processes` is Dev-channel only; `chrome.system.memory` is device-wide. De-risk:
a documented weight table in `core/memory/estimate.ts`, every figure rendered through a
single `<Estimated>` component that is *incapable* of printing a number without the
qualifier, and the whole table exposed and editable in settings. Test: assert no UI
string containing "MB" is produced outside that component.

**R2 — The MV3 service worker dies between any two lines.**
De-risk: worker holds zero state; every handler is `read storage -> compute -> write
storage`. All writes go through one `mutate(key, fn)` helper that re-reads before writing,
so two racing wakeups cannot clobber each other. Test: a worker-restart simulation that
drops all module state between events and asserts identical outcomes.

**R3 — Undo is the entire trust proposition, and it is lossy by nature.**
`chrome.sessions.restore` is per-item and cannot do a 100-tab bulk undo. De-risk: our own
snapshot stack, restore via `tabs.create` + re-apply pinned/window/group, and an automated
test that closes 100 fixture tabs, undoes, and asserts URL set, pinned state, window
assignment and group membership. The UI states plainly what undo cannot bring back
(scroll, form state, history).

**R4 — Staleness data is partly fiction for pre-install tabs.**
`tabs.lastAccessed` (Chrome 121+) exists but is unhelpful for tabs that predate install.
De-risk: our own `lastSeenActive` map, backfilled once from `lastAccessed` with
`inferred: true`, and an `inferred` flag that propagates all the way to the label. Never
render a confident age for an inferred record.

**R5 — Perf targets are asserted, not measured, in most extensions.**
De-risk: search index built once and filtered incrementally, with a Vitest perf test that
fails over 16ms/keystroke at 800 tabs; a bundle-size script that fails the build over
120KB gzipped for the popup; virtualized register rows so the dashboard does not mount
800 DOM subtrees.

## 6. Correction to the brief (see DECISIONS.md D-001)

The brief specifies `chrome://favicon2/`. That is a Chrome-internal URL and is **not**
reachable from an MV3 extension. The MV3 form for the `favicon` permission is
`chrome.runtime.getURL("/_favicon/") + "?pageUrl=<url>&size=<n>"`. Building it as written
would have produced broken images on every row. Implemented the working form; the intent
of the instruction (local favicons only, never network) is preserved exactly.

## 7. What I will not do

No state management library, no event bus, no i18n layer, no plugin system, no
abstraction with one implementation. Phase 3 decoration (confetti, badges, drag-and-drop)
is cut unless everything above is green.
