# Tab Debt

A Chrome extension (Manifest V3) for people with 200–800 open tabs.

Existing tab managers either list your tabs — useless at 400 — or offer to close them in
bulk, which is terrifying, so nobody does it. Tab Debt treats tabs as a **debt ledger**: it
quantifies what you owe honestly, tells you exactly which chunk to pay off first and what it
costs, and makes paying it off a single reversible action.

The score is diagnostic, not a scold. The copy never guilt-trips. The target feeling is
relief.

---

## What it does

**Popup — the triage surface.** Search focused on open, the balance and its breakdown, and
the top three highest-leverage actions, each one click with an undo toast.

**Dashboard — everything else.** A dense, virtualised register of every tab, a duplicates
review, and a permanent undo history.

### The Balance Bar

The debt score is rendered as a statement balance, with a stacked bar beneath it where each
segment is one scoring factor sized by its point contribution. Every segment is a button:
hover names the factor and its points, click runs that factor's remedy. The chart *is* the
control surface — not a chart, plus a legend, plus a separate list of buttons.

```
BALANCE                                              Overdue
77 / 100                                            800 tabs
████████████▓▓▓▓▓▓▓▓▒▒▒▒▒▒▓▓▓▓░░░░░
+30 Tab count      800 tabs open, 775 above your baseline of 25
+20 Duplicates     210 redundant tabs across 48 groups
+16 Stale tabs     737 tabs untouched for over a week
```

### The features that matter

- **12-category classification** from a rule table that is a *data file*, not code branches.
  Five tiers: your overrides, domain allow-list, path heuristics on multi-purpose sites
  (`youtube.com/watch` with a tutorial title → Learning, not Entertainment), title keyword
  scoring, then Other. Hover any category chip to see which rule fired.
- **Three-tier duplicate detection** — identical, canonical (tracking params, trailing
  slashes, anchors), and same-page-different-query — shown separately because they carry
  different risk. Never auto-closes. Pinned, audible, draft and editor tabs are never
  auto-selected, and are listed with the reason.
- **Undo that actually works.** Close 100 tabs, hit undo, and they come back to the right
  windows, with pinned state, mute state and group membership restored. It says plainly what
  it cannot restore: scroll position, form contents, page history.
- **Search** at under 16ms per keystroke on 800 tabs. Arrows navigate, Enter switches to the
  tab and focuses its window, Cmd/Ctrl+Enter closes it, Esc clears.

## Privacy

**No network requests. Ever.** No telemetry, no accounts, no CDN, no remote fonts, no remote
favicons. Everything lives in `chrome.storage.local` on your machine.

This is enforced, not promised: a build-time check fails the build if `fetch`,
`XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon` or any remote URL appears in the
shipped bundle. It has already caught one real violation — Vite's modulepreload polyfill.
See [PRIVACY.md](PRIVACY.md).

## Install

```bash
npm install
npm run build
```

Then `chrome://extensions` → enable Developer mode → **Load unpacked** → select `dist/`.

Requires Chrome 121+ (`tabs.lastAccessed`, the staleness seed).

## Develop

The dashboard runs against generated fixtures in a plain browser tab, with **no extension
installed** — you cannot manually open 400 tabs, so the harness was built before any feature:

```bash
npm run dev:mock     # http://localhost:5173/?fixture=800
```

Sizes: 50, 200, 400, 800. Switch with the dropdown in the left rail or the `?fixture=` param.

## Test

```bash
npm run verify   # typecheck → lint → tests + coverage → build → budgets → privacy
```

```
tsc            zero errors
eslint         zero errors, zero warnings
vitest         333 passed
coverage       statements 99.48% · branches 96.45% · functions 100%   (src/core/)
budgets        popup 39.5/120 KB gzipped · dashboard 42.7/220 · options 26.7/160 · worker 22.0/100
privacy        no network capability in 13 bundled files
a11y           keyboard, focus, labels, reduced-motion, WCAG AA in both themes
```

See [TESTING.md](TESTING.md) for the fixture switcher and the manual QA checklist.

## Architecture in one line

`src/core/` is pure domain logic that never imports `chrome.*` — enforced by ESLint, and the
reason an 800-tab fixture can run in Node in milliseconds. `src/services/` is the only layer
that touches Chrome. The service worker holds zero state, because MV3 kills it between any
two lines.

Read [ARCHITECTURE.md](ARCHITECTURE.md).

## Documents

| | |
|---|---|
| [PLAN.md](PLAN.md) | Phases and the five riskiest unknowns, written before the code |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Layering, data model, the ephemeral worker |
| [DESIGN.md](DESIGN.md) | Token plan, the statement metaphor, the signature element |
| [DECISIONS.md](DECISIONS.md) | Every non-obvious choice and its reason |
| [CRITIQUE.md](CRITIQUE.md) | Self-critique from looking at the 800-tab dashboard, and the fixes |
| [PERMISSIONS.md](PERMISSIONS.md) | Store-review-ready justification per permission |
| [PRIVACY.md](PRIVACY.md) | The policy |
| [TESTING.md](TESTING.md) | How to run everything; manual QA checklist |
| [STORE.md](STORE.md) | Web Store submission guide and rejection-avoidance |
| [ROADMAP.md](ROADMAP.md) | What is deliberately not built |

## Stack

Manifest V3 · TypeScript (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`)
· Vite + `@crxjs/vite-plugin` · Preact via `preact/compat` · Tailwind over CSS custom
properties · Zod at every storage boundary · Vitest.

Four runtime/build dependencies total. No state manager, no component library, no fuzzy-
search library, no virtualisation library — each justified in DECISIONS.md D-011.
