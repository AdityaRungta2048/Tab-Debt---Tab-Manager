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

## Shipped — Phase 2

Composable filters (nine quick filters plus category and window, ANDing across dimensions
and ORing within one) with a visible active-filter bar and one-click clear · collapsible
domain rows with per-domain counts, staleness and bulk actions, composing with the filters ·
named sessions with save, restore into a new window, rename, delete and JSON export/import,
warning before restoring a large session · settings completed with an editable heavy-domain
multiplier table.

## Shipped — Phase 3

Trends over the daily roll-ups: tabs-open and debt-score curves, per-category small
multiples, and a table twin for every chart · cleanup streak and totals · CSV export of the
current tab list and of the history · onboarding, three screens, skippable at every step ·
the quick-open keyboard shortcut (Ctrl/Cmd+Shift+K, shipped in the manifest since Phase 1).

### Deferred out of Phase 3

- **Onboarding is shown on first run of the dashboard, not the popup.** Someone who installs
  and clicks straight into the popup meets the product without the three screens. A modal in
  a 400×600 triage surface would be worse than the gap.
- **The debt-score chart earns its space less well for heavy users**, because a very large
  tab count saturates the score near the top of its range and the line goes flat. The tabs
  chart carries the story in that case.

## Cut, and staying cut unless everything above is green

Confetti, achievement badges, a "productivity score", drag-and-drop category assignment.
These are decoration on a product whose entire value is being trusted with destructive
actions. Adding celebration animation to a tool whose job is to make people feel *relief*
rather than judged would also work against the copy rules in DESIGN.md.

### Deferred out of Phase 2

- **Saving a session from a hand-picked selection.** Sessions can be saved from the whole
  set or from the current filter, but not from twelve rows ticked by hand. That needs the
  register's selection state lifted out of the Dashboard, which is a refactor rather than a
  Sessions change.
- **Sessions do not restore tab groups.** Only url, title and pinned state are stored, so a
  restored session comes back ungrouped. Undo restores groups because it snapshots them;
  the session schema predates that decision and changing its shape now needs a migration.
- **Recategorise from the register** — overrides can be added and edited in Settings, but
  the natural place to create one is the row where you noticed the wrong category. That
  popover hangs off the existing "why this category" affordance.

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
