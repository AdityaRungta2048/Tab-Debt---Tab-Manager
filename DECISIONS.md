# DECISIONS

One entry per non-obvious choice. Written as the choice was made, not reconstructed after.

---

### D-001 — The brief's favicon API does not exist in MV3. Used the real one.

**The brief says:** use the `favicon` permission and the `chrome://favicon2/` URL form.

`chrome://favicon2/` is a Chrome-*internal* URL. An extension page cannot load it; every
row in the register would have rendered a broken image. The MV3 form is:

```ts
chrome.runtime.getURL('/_favicon/') + '?pageUrl=<url>&size=<n>'
```

Verified against current Chrome extension documentation before writing any of it.

**Decision:** implemented the working form. The *intent* of the instruction — favicons come
from Chrome's local cache, never over the network — is preserved exactly, and is enforced
by `scripts/check-no-network.mjs`. Because Tab Debt has no content scripts, the
`web_accessible_resources` entry the docs describe is unnecessary: only extension pages
request favicons.

### D-002 — Memory is an openly-labelled estimate, and the heuristic is user-editable.

There is no stable per-tab memory API. `chrome.processes` is Dev-channel only;
`chrome.system.memory` reports device totals. Inventing an API was the failure mode the
brief warned about, and quietly presenting a guess as a measurement is worse than not
showing one at all.

**Decision:** a weight table (base cost per tab, multipliers for known-heavy domains,
near-zero for discarded tabs), surfaced and editable in Settings. Rendering is funnelled
through one `<Estimated>` component that is structurally incapable of printing a number
without the qualifier, and `formatMb` is asserted by test to always contain `(estimated)`.

Follow-up from CRITIQUE #1: in the register the visible per-row suffix moved to the column
header (`Size (est.)`) because 800 repetitions of "est." wrapped the cell. The tooltip and
the screen-reader text are unchanged, so the guarantee holds — it just costs one line
instead of eight hundred.

### D-003 — Activity records are keyed by tab id **and** a URL hash.

Chrome reuses tab ids freely across restarts. Keying on the id alone would hand one tab's
history to an unrelated tab, producing confident, wrong ages — the single most trust-
destroying bug available in this product.

**Decision:** `activityKey = ${tabId}:${djb2(url)}`.

### D-004 — Staleness bucket edges, since the brief names buckets but not edges.

The brief lists: today, yesterday, 3 days, 7 days, 30+, never. Read literally those leave a
gap between 7 and 30 days. Edges chosen at **1d / 2d / 7d / 30d**, which tile the line with
no gaps or overlaps.

Labels state the real range — "2–6 days", "1–4 weeks" — rather than a rounded name.
Calling a five-day-old tab "3 days" is a small lie, and being trusted about ages is the
whole value proposition. Lower bound inclusive, upper exclusive, so a tab aged exactly 24h
is Yesterday and the counts never flicker.

### D-005 — Duplicate tiers partition; they do not overlap.

Two bugs found by test while building this:

1. The exact and canonical tiers both claimed a byte-identical pair, so a four-tab family
   reported "close 1" *and* "close 3" — close all four, leaving nothing.
2. A same-page cluster could close a tab that an earlier cluster's preview had just
   promised to keep.

**Decision:** a tab slated for closing by a safer tier is withdrawn before the next tier
runs, and the same-page tier skips any family a safer tier touched at all. Once a page has
literal duplicates, "close the duplicates" is the useful advice; additionally telling the
user their remaining searches are "the same page" is noise on top of noise.

### D-006 — Fragments are kept unless they are clearly plain anchors.

The cost of a false positive (collapsing two different pages, user loses a tab) hugely
exceeds the cost of a false negative (a duplicate goes unreported). So canonicalisation
errs toward keeping: a fragment survives when the path is `/` or empty, when it contains a
slash, or when it is a `#!` route. `.../docs/fetch#syntax` collapses onto its bare page;
`app.example.com/#/inbox` and `#/settings` stay distinct; `gmail/#inbox/abc` and
`#inbox/def` stay distinct.

### D-007 — The 15% suggestion gate is asserted at 400 and 800 tabs; 200 measures 13.5%.

The brief sets the bar "on the fixture" and states elsewhere that criteria are met against
the **400-tab fixture**. Measured: 50 → 36%, 200 → 13.5%, 400 → 16.3%, 800 → 17.6%.

Smaller sets have proportionally fewer random duplicate collisions, so the top suggestion
is genuinely smaller there. **Decision:** assert 15% at 400 and 800 (the brief's target),
assert a real ≥10% floor at 50 and 200, and write the true number down rather than tuning
the fixture until the gate turns green. A fixture edited to make its own test pass measures
nothing.

### D-008 — Suggestions de-overlap, and are rebuilt rather than patched.

Without a de-overlap pass, the same 40 stale GitHub tabs appear in the duplicates
suggestion, the domain pileup and the Development sweep, and the three counts on screen add
up to more tabs than the user has. Each tab is claimed by the highest-ranked suggestion
that wants it; anything that falls below the three-tab minimum afterwards is dropped rather
than shown with a quietly shrunken count. A headline saying 40 next to an action that closes
12 is exactly how trust in a destructive tool dies.

### D-009 — Rule matching is sorted by specificity, not by file order.

`google.com` listed before `news.google.com` silently made the latter dead code. In a data
file explicitly intended for non-authors to edit, that is a trap. **Decision:** compute
specificity (path > dot count > length, wildcards penalised) and match most-specific-first,
so file order cannot affect correctness.

### D-010 — Large sweeps bookmark before closing.

A one-click action that closes 70 tabs is terrifying regardless of how good the undo is.
Sweeps of 20 or more save to a dated bookmark folder first, and if **any** bookmark write
fails, **nothing** is closed and the toast says the tabs are untouched. A partial save is
treated as a failed save: losing a tab you explicitly asked to have saved is the worst
outcome this product has.

### D-011 — Dependencies. Four in total.

| Dependency | Replaces | Why not hand-rolled |
|---|---|---|
| `preact` | React | The brief mandates it, and the popup budget justifies it: 39.5KB gzipped against a 120KB budget. |
| `zod` | Hand-written validators | Every storage read is validated with a versioned schema and defaults. Hand-rolling ~10 recursive validators with defaulting is more code and more bugs, and 14KB is affordable outside the popup's critical path. |
| `@crxjs/vite-plugin` | Manual manifest/HMR plumbing | Build tooling only; ships nothing. |
| `playwright` (dev) | Manual eyeballing | Drives the real browser for the accessibility audit and screenshots. Dev-only. |

Deliberately **not** added: a state manager (plain hooks are enough), a component library
(hand-rolled primitives — a library's worth of unused code in a popup is a bug), a fuzzy
search library (~40 lines here, and the perf budget wanted a custom incremental path), a
virtualisation library (~30 lines for a fixed row height).

### D-012 — Vite's modulepreload polyfill is disabled.

The privacy check found a real `fetch(` in the built bundle: Vite injects a modulepreload
polyfill that fetches `<link modulepreload>` hrefs. Chrome supports modulepreload natively,
so in an extension it is both dead weight and a violation of the stated guarantee.
Disabled in `vite.config.ts`; the check catches it if it is ever turned back on.

### D-013 — The bundle-size checker walks the real module graph.

The first version matched chunks by filename, which under-reported the service worker as
1.1KB against its true 22KB — rollup names chunks after whichever module happened to be the
root. The second version's import regex required whitespace around `from`, which minified
output does not have, so it matched nothing. Both were budgets that would have passed
whatever the code did. It now parses each entry HTML and follows imports transitively,
tolerating minified syntax.

### D-014 — Colour tokens are solved against every ground, not picked by eye.

Three tokens I had chosen deliberately and documented as design choices failed WCAG AA:
`--ink-faint` (2.44:1), `--state-warn` (2.96:1), `--state-good` (3.98:1). The amber was the
one that mattered — it flags stale and never-opened tabs, so the most important signal in
the register was its least legible element. Values are now solved against `--card`,
`--paper` and all three tinted state bands, worst case binding, and verified on rendered
text in both themes by `scripts/check-a11y.mjs`.

---

## Phase 2

### D-015 — Filters AND across dimensions, OR within one.

"Stale + Pinned" means stale **and** pinned: narrowing, which is what a filter is for and
what the brief specifies. But picking two categories means **either** of them, because a tab
cannot be two categories at once and ANDing there would return nothing, every time, for
every user who tried it.

The rule is therefore per-dimension rather than global. Both halves are asserted by test,
including the property that composing any two quick filters never returns more than either
alone.

### D-016 — Named sessions are ours; `chrome.sessions` is not used for them.

`chrome.sessions` is a recently-closed list, not a named-session store: it cannot hold an
arbitrary user-named set indefinitely, and its entries expire. Named sessions are therefore
serialised to `storage.local` under the versioned, Zod-validated `td.sessions.v1` schema
that has been in the migration path since day one. The permission is still requested and
used for its actual purpose — surfacing tabs closed outside Tab Debt.

Restore always opens a **new window**, so restoring never rearranges what the user is
currently looking at, and is best-effort per tab: a session saved months ago may contain a
URL Chrome now refuses, and losing 199 tabs to one bad entry would be absurd.

Import re-keys colliding ids rather than dropping them. Importing an export onto the same
install would otherwise silently lose a session, which is the opposite of what "import"
promises.

### D-017 — The `danger` variant is reserved, like the state colours.

Phase 2's first draft gave every domain row a red "Bookmark & close N" button, so a viewport
showed 26 of them. Repeated that often, red stops meaning danger, and the destructive action
becomes the most prominent thing in a product whose thesis is relief rather than fear.

It was also miscommunicating: bookmark-and-close saves every tab first and closes nothing at
all if a single save fails, so it is the *safe* variant. `danger` is now spent only where a
single red button appears in a view — the raw "Close N" in duplicates and in the selection
bar. Same discipline as the state colours, applied to buttons.

### D-018 — Every Phase 2 view consumes the FILTERED list.

Filters feed the register, the domain rollup, bulk selection and session saving alike, from
one `visibleTabs` memo. That is what turns two features into one: "GitHub tabs untouched for
a month" becomes a single domain row with a single button, and "save what I'm looking at"
means what it says.

Two consequences worth stating. Select-all selects the visible set, not the hidden one — a
select-all that silently includes 700 filtered-out tabs would be a data-loss bug waiting to
happen. And clicking a Balance Bar segment clears the filters first, because selecting tabs
the active filter is hiding would look like the remedy did nothing.
