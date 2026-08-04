# TESTING

## Run everything

```bash
npm run verify      # typecheck → lint → tests with coverage → build → budgets → privacy
```

Individually:

```bash
npm run typecheck      # tsc --noEmit, zero errors
npm run lint           # eslint, zero errors AND zero warnings
npm test               # vitest run
npm run test:coverage  # …with the ≥90% gate on src/core/
npm run build          # tsc + vite build + bundle budgets + privacy scan
npm run check:budget   # bundle budgets alone (needs dist/)
npm run check:network  # privacy scan alone (needs dist/)
npm run check:a11y     # accessibility audit in a real browser (needs the mock server)
```

Current state:

```
tsc            zero errors
eslint         zero errors, zero warnings
vitest         486 passed
coverage       statements 99.60% · branches 96.10% · functions 100% · lines 99.60%
budgets        popup 39.8/120 KB · dashboard 51.5/220 · options 27.7/160 · worker 22.0/100
privacy        no network capability in 13 bundled files
a11y           7/7 checks pass, both themes
```

## CI

`.github/workflows/verify.yml` runs the whole loop on every push and pull request:
typecheck, lint, tests with the core coverage gate, build, bundle budgets and the privacy
scan in one job; the real-browser accessibility audit in a second, so a flaky browser
download cannot mask a failure in the core loop.

The browser-driven scripts take `CHROMIUM_PATH` when a Chromium is already present, and
otherwise fall back to Playwright's own bundled browser — which is what CI uses.

## The fixture switcher

You cannot manually open 400 tabs, so the dashboard runs against generated fixtures in a
plain browser tab with **no extension installed**:

```bash
npm run dev:mock          # http://localhost:5173
```

Then either use the dropdown in the top-left of the left rail, or go straight to a size:

```
http://localhost:5173/?fixture=50
http://localhost:5173/?fixture=200
http://localhost:5173/?fixture=400     # default
http://localhost:5173/?fixture=800
```

The mock `chrome.*` (`src/test/mocks/chrome.ts`) implements exactly the surface Tab Debt
uses — tabs, tabGroups, windows, storage.local, alarms, bookmarks, runtime — backed by the
generated fixture. Closing, grouping, undo and storage all genuinely work against it.

**Known dev-mode artefact:** favicons 404, because `chrome-extension://…/_favicon/` does not
resolve outside an installed extension. Rows show blank icon boxes. Deliberately not
mocked — a fake favicon would make the harness prettier and less faithful.

## What the fixture guarantees

Every generated set is deterministic per seed and contains, by construction:

- Duplicate clusters at **all three tiers**, including a hash-routed SPA whose fragments are
  real routes and must not collapse
- A tab at **every staleness boundary and one second either side** (1d, 2d, 7d, 30d)
- Never-activated, pinned, audible, muted, discarded and grouped tabs
- Multiple windows
- Pathological cases: `about:blank`, `chrome://` pages, a 700-character URL, non-Latin
  titles, and identical titles on different URLs

`src/test/fixtures/generate.test.ts` asserts all of the above. If the fixture stops
containing these shapes, every downstream test is measuring nothing, so that file is the
gate for everything else.

## Screenshots

```bash
npm run dev:mock &
npm run screenshot        # writes to the scratchpad shots/ directory
```

Captures the dashboard at 800 tabs in light and dark, plus the domains, sessions and
duplicates views and a composed two-filter state. This is how `CRITIQUE.md` was written —
from looking at the rendered product, not from imagining it.

## Manual QA checklist

Steps 1–4 and 7 of the verification loop are automated above. These require a real Chrome
profile with real tabs and **cannot be run in a headless CI container**:

### Install

1. `npm run build`
2. `chrome://extensions` → Developer mode → **Load unpacked** → select `dist/`
3. Open at least 100 real tabs across at least two windows

### Popup

- [ ] Opens in well under a second, search box already focused
- [ ] Typing filters instantly; ↑/↓ move the selection; Enter switches to the tab **and
      focuses its window**; Cmd/Ctrl+Enter closes it; Esc clears
- [ ] Balance figure, state label and factor bar all render; segments have tooltips
- [ ] At most three suggestions; none affects fewer than three tabs
- [ ] "Preview" expands the exact list of affected tabs
- [ ] Running the top suggestion shows a toast that persists ~10s with a working **Undo**
- [ ] "Open dashboard" opens one dashboard; clicking it again **reuses** that tab

### Dashboard

- [ ] Loads with 100+ real tabs and scrolls smoothly (rows are virtualised)
- [ ] The dashboard's own tab does **not** appear in the register or in any count
- [ ] Clicking a Balance Bar segment selects that factor's tabs, or jumps to Duplicates
- [ ] Category chips explain themselves on hover ("why this category")
- [ ] Ages show `~` for inferred records; the column header explains it
- [ ] Sizes are labelled `Size (est.)` and every cell has an "estimated" tooltip
- [ ] Duplicates panel: three tiers shown separately; keep/close preview is correct;
      keep-newest / keep-oldest / keep-pinned changes which tab survives; pinned, audible
      and editor tabs appear as protected with a reason
- [ ] Select tabs → Close → toast → Undo restores them to the right windows and groups
- [ ] History panel undoes an operation from several minutes ago
- [ ] Bookmark-and-close writes into `Other bookmarks / Tab Debt / YYYY-MM-DD / <label>`

### Filters, domains and sessions

- [ ] Two quick filters compose: "Stale" + "Never opened" shows fewer tabs than either alone
- [ ] The active-filter bar shows a chip per filter and an accurate "N of M tabs" count
- [ ] Removing one chip widens the result; "Clear" resets everything
- [ ] Filters narrow the Domains view too, not just the register
- [ ] Select-all with a filter active selects only the visible tabs, never the hidden ones
- [ ] Clicking a Balance Bar segment clears the filters before selecting
- [ ] A domain row expands to its tabs; "Group N" makes a named, collapsed tab group
- [ ] Save a session, close those tabs, restore it — a **new window** opens with them in it
- [ ] Restoring a 200+ tab session asks for confirmation first
- [ ] Rename a session by editing its name and clicking away; it persists across a reload
- [ ] Export sessions to JSON, delete them all, import the file back — all return
- [ ] Importing a non-Tab-Debt JSON file explains the problem and changes nothing

### Trends and onboarding

- [ ] Trends is empty on a fresh install and says so — it fills in as days pass
- [ ] 7 / 30 / 90 day range scopes every chart at once, not one card
- [ ] Hovering a line moves the crosshair and updates the read-out below it
- [ ] "Show table" reveals every plotted value as text
- [ ] Export tabs CSV and Export history CSV both download and open cleanly in a spreadsheet
- [ ] A tab whose title starts with `=` exports with a leading apostrophe, not as a formula
- [ ] Onboarding appears once on first run, is skippable at every step, and does not return
- [ ] Setting the baseline on the third screen changes the debt score afterwards

**Mock:** append `&onboarding=1` to the dev URL to replay onboarding.

### Service worker

- [ ] `chrome://extensions` → inspect the service worker → console has **no errors**
- [ ] Click **terminate** on the worker, then activate a tab and reopen the popup —
      everything still works and activity is still recorded
- [ ] `chrome.alarms.getAll()` in the worker console lists `td.snapshot` and `td.prune`

### Accessibility

- [ ] Tab through both surfaces using only the keyboard; focus is always visible
- [ ] Turn on "Reduce motion" at the OS level — the score no longer counts up, it snaps
- [ ] Switch the OS between light and dark; both are legible. Override in Settings; it wins

### Data

- [ ] Settings → Export a copy → a JSON file downloads
- [ ] Settings → Delete all data → settings return to defaults, **tabs are untouched**
