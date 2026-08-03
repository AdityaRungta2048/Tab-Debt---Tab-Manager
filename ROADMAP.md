# ROADMAP

What is deliberately not built, and why. Phase 1 is complete and shippable; everything below
is honest about being absent rather than half-present.

## Shipped — Phase 1

Tab index with 12-category classification and a "why this category" affordance · three-tier
duplicate detection with preview and keep-strategy · debt score with per-factor breakdown
and one-click remedies · staleness bucketing · suggestion engine · bulk actions (close,
group, bookmark-and-close, archive, pin, mute) with undo toast and a permanent history
panel · keyboard-first fuzzy search · popup triage surface · dashboard register · settings ·
the fixture and mock harness.

## Not built yet

### Phase 2 — depth

- **Domain grouping** — collapsible per-domain rows with counts, staleness summary and
  per-domain bulk actions. The data is already computed for the concentration factor; this
  is a presentation layer over it.
- **Composable filters** — Today / This week / Stale / Duplicates / Pinned / Audible /
  Muted / Discarded / Never opened / by Category / by Window, ANDed, with a visible active-
  filter bar. Currently the register shows everything and search is the only narrowing tool.
- **Named sessions** — save the current window or a filtered selection, restore into a new
  window, rename, delete, export/import as JSON, with a warning before restoring a 200-tab
  session. The storage schema (`td.sessions.v1`) and its Zod validation already exist and
  are wired into export; no UI reads or writes them yet. That is the one place in the
  codebase where a shape exists ahead of its feature, and it is deliberate — the schema
  needed to be in the versioned migration path from day one.
- **Recategorise from the register** — overrides can be added and edited in Settings (they
  are tier 1 of the classifier, so they belong in Phase 1), but the natural place to create
  one is the row where you noticed the wrong category. That popover, hanging off the
  existing "why this category" affordance, is Phase 2.

### Phase 3 — polish

Analytics views over the daily aggregates (the data is being collected and pruned already,
nothing renders it yet) · CSV export · cleanup streak · onboarding, three screens maximum
and skippable.

## Cut, and staying cut unless everything above is green

Confetti, achievement badges, a "productivity score", drag-and-drop category assignment.
These are decoration on a product whose entire value is being trusted with destructive
actions. Adding celebration animation to a tool whose job is to make people feel *relief*
rather than judged would also work against the copy rules in DESIGN.md.

## Known limitations

- **The 500ms dashboard-interactive budget is unverified in production.** Measured ~850ms
  against the dev server, which transforms modules on demand and is not a fair proxy for the
  built bundle. Verifying it properly needs a real extension profile with 800 real tabs,
  which the build environment cannot provide. Recorded as unverified rather than claimed.
- **Manual QA steps 5 and 6 of the verification loop have not been run.** Loading the
  unpacked extension into a real Chrome profile with 100+ real tabs, and terminating the
  service worker from `chrome://extensions`, both require a desktop browser session. The
  checklist for them is in TESTING.md; the automated worker-restart simulation in
  `src/background/background.test.ts` covers the same failure mode as far as it can without
  a real browser.
- **Memory figures are heuristic, and always will be** until Chrome ships a stable per-tab
  memory API. See DECISIONS.md D-002.
- **Never-opened detection is only fully accurate for tabs opened after install.** Chrome
  stamps `lastAccessed` at creation, so tabs that predate installation cannot be
  distinguished between "opened and viewed once" and "never viewed". Those are marked
  `inferred` and rendered with a `~`; accuracy improves the longer the extension is
  installed.
- **Suggestion leverage is lower on small tab sets** — 13.5% of a 200-tab fixture against
  the 15% target, because smaller sets have proportionally fewer duplicate collisions. See
  DECISIONS.md D-007.
