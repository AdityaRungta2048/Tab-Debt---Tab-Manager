# CRITIQUE

Written after opening the dashboard against the 800-tab fixture in a real Chromium at
1440×900, in both themes. Not written from imagination — the screenshots are what prompted
each of these.

---

## Phase 1

### 1. The Size column was an unreadable smear, 800 rows deep — FIXED

The worst thing on screen, and I had not noticed it until I looked. `Estimated` rendered
`~60 MB` followed by a separate `est.` span inside an 80px column. It wrapped, so the
suffix stacked *on top of* the number in every single row, producing a grey smudge down
the entire right edge of the densest surface in the product.

Worse than the visual bug: nearly every row read `~60 MB`, because the heuristic returns
the base weight for any domain not on the heavy list. So the column consumed 80px of the
most valuable horizontal space in the product and told the user almost nothing.

**Fixed.** The qualifier moved to the column header (`Size (est.)`), where it is stated
once and unmissably, instead of 800 times illegibly. Per-row text is now nowrap and
screen-reader users still get "estimated" on every cell via `sr-only`. The honesty
guarantee is unchanged — it is asserted by test — but it now costs one line instead of
eight hundred.

### 2. "(estimated)" on nearly every row destroyed the 28px rhythm — FIXED

On first run there are no observed activity records, so every age is backfilled from
`tabs.lastAccessed` and every row is `inferred`. `formatAge` therefore appended
`(estimated)` to ~90% of rows, which wrapped to two lines and pushed rows past their
intended 28px.

The density that the whole design argument rests on was being spent on repeating a caveat
the user learns once. This is the failure mode of an honesty rule applied without judgement:
it stops reading as honesty and starts reading as noise.

**Fixed.** Added `formatAgeCompact`, which marks an inferred age with a leading `~` — a
universally understood "approximately" — instead of a six-character parenthetical. The
column header carries the explanation, the cell carries a tooltip, and `sr-only` text
still says "estimated" in full. Rows no longer wrap.

### 3. The state colour flooded the whole left rail — FIXED

DESIGN.md says: spend your boldness in exactly one place. I then painted `bg-bad-soft`
across the entire balance section — the figure, the stacked bar, *and* the six-row factor
list. At 800 tabs the score is red, so a third of the viewport was a pink field, and it was
by far the loudest thing on screen. It also hurt legibility of the factor rows sitting on
top of it.

Compounding it: every segment of the stacked bar used the same state colour, so the
segments were distinguishable only by the 1px gaps between them. The signature element —
"each segment is one factor, click it to fix that factor" — did not read as segmented at
all.

**Fixed.** The tinted band is now confined to the balance figure and its bar. The factor
list sits on the ordinary card ground. Segments now step through an opacity ramp, so they
are individually legible while still spending only one hue.

### 4. Button labels were truncated mid-phrase — FIXED

`headline.split(' ').slice(0, 2).join(' ')` produced buttons reading **"Bookmark and"**.
The brief is explicit that a button label is the verb that happens, and "Bookmark and" is
not a verb phrase — it is a sentence fragment that stops before the part that matters.

**Fixed.** Labels now derive from the action kind (`Close 209`, `Bookmark & close 209`,
`Group 92`), so they always name the whole action and its count.

### 5. Three colour tokens failed WCAG AA — FIXED

The accessibility pass measured contrast on rendered text in a real browser, in both
themes, against each element's actual computed background. 72 text nodes failed in light
mode and 16 in dark.

The causes were tokens I had picked by eye and described in DESIGN.md as deliberate:
`--ink-faint` at **2.44:1**, `--state-warn` at **2.96:1**, `--state-good` at **3.98:1**.
The amber was the instructive one — it is the colour used to flag stale and never-opened
tabs, so the single most important signal in the register was the least legible thing in it.

**Fixed.** Values re-solved against every ground each token lands on — `--card`, `--paper`,
and all three tinted state bands — taking the worst case as binding. Light mode is now
`#5F6A78` / `#7A5200` / `#26674B` / `#A5323F`; dark `--ink-faint` went to `#97A1B0`. All
rendered text in both themes now passes AA. DESIGN.md is updated with the real values.

### Not fixed, recorded instead

- **Dashboard interactive time is measured in dev mode (~850ms), not production.** The
  500ms budget applies to the built bundle; the dev server transforms modules on demand
  and is not a fair measure. Production timing needs a real extension profile, which this
  environment cannot provide. Recorded in ROADMAP.md rather than claimed as passing.
- **Favicons 404 under `vite dev --mode mock`.** `chrome-extension://…/_favicon/` does not
  resolve outside an installed extension. Harmless and dev-only, but it means the mock
  dashboard shows blank favicon boxes. A mock favicon would make the harness prettier and
  less faithful; leaving it.
- **The 280px rail wraps suggestion copy badly at three lines.** Legible, not elegant.
  Tightening it is Phase 2 work alongside the filters that share the rail.
