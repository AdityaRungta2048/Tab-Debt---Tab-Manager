# DESIGN

## The concept: a statement, not a dashboard

The product's metaphor is debt. Debt has an existing, highly-evolved visual language:
the **account statement**. Statements are dense, monospaced in the numeric columns,
ruled rather than boxed, and utterly quiet everywhere except the balance. That is
exactly the right shape for a surface that must show 800 rows without drowning.

So: **Tab Debt looks like a statement for an account you did not know you had.**

Concretely that means dense 28px register rows separated by hairlines (not cards, not
shadows), numbers right-aligned in tabular figures so columns scan vertically, and a
single loud element — the balance.

### What I deliberately rejected

- **Cream + high-contrast serif + terracotta.** The current AI-design house style. Also
  wrong for the content: serif display type at 800 rows is noise.
- **Near-black + one acid accent.** Same objection, plus the state colors (green / amber /
  red) are load-bearing here, so a neon brand accent would fight the only colors that
  carry meaning.
- **Broadsheet hairline-rule editorial layout.** Tempting given "statement," but editorial
  layouts optimize for reading one thing; this optimizes for scanning many.
- **Linear's dark violet gradient.** The brief says mine financial interfaces, not copy the
  current dev-tool default. Gradients also cost contrast at density.

## Tokens

Six named values. Every one is a CSS custom property; dark and light are both first-class,
system preference by default with a manual override.

| Token | Light | Dark | Role |
|---|---|---|---|
| `--ink` | `#151A23` | `#E7EBF1` | Text, and the dark-mode inverse. Navy-black, never `#000`. |
| `--paper` | `#F2F4F7` | `#151A23` | Page ground. Cool, like security paper — not cream. |
| `--card` | `#FFFFFF` | `#1C222D` | Register ground, one step off `--paper`. |
| `--rule` | `#D3D8E0` | `#2A313D` | Hairlines. The only separator in the product. |
| `--ledger` | `#2D4B7C` | `#7FA3DC` | The quiet brand. Interactive, focus rings, links. Deep statement-ink blue. |
| `--state-*` | `#26674B` / `#7A5200` / `#A5323F` | `#4FBE8B` / `#E0A93C` / `#E0697A` | Green / amber / red. **Printed-ink saturation, not neon.** Reserved exclusively for score state. |

Every value above is **solved for WCAG AA against every ground it actually lands on**, not
just against white — a token can sit on `--card`, `--paper`, or any of the three tinted
state bands, and the binding constraint is the worst of those. My first pass picked colours
by eye and three of them failed: `--ink-faint` at 2.44:1, `--state-warn` at 2.96:1 and
`--state-good` at 3.98:1. The audit in `a11y.mjs` measures rendered text in the real
browser in both themes and fails the pass, which is the only reason those were caught.

The state colors are spent only on the score and its factor bar. Nothing else in the
product is allowed green, amber, or red except destructive-confirm text. That is the
"spend your boldness in one place" rule, enforced by convention and reviewed in CRITIQUE.

## Type

Two faces, two roles, both system stacks — **no webfonts, because no network requests,
ever** (see PRIVACY.md). The privacy guarantee and the type choice happen to agree.

- **Text face** — `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`.
  Role: labels, titles, copy, buttons. 13px base in the register, 14px in the popup.
- **Numeric face** — `ui-monospace, "SF Mono", "JetBrains Mono", Menlo, monospace`, with
  `font-variant-numeric: tabular-nums`. Role: **every number in the product** — the score,
  tab counts, estimated MB, ages, point contributions. No exceptions.

That second rule is the one that makes it read as a statement rather than a web app.
A count set in the text face immediately looks wrong once you have seen the register.

## Layout

**Popup (400×600)** — vertical statement header:
balance band, then search, then the three suggested actions as ruled rows. Nothing else.

**Dashboard** — two columns:
- Left rail, 280px, sticky: the **account summary** — balance band, factor breakdown with
  per-factor remedies, then filters.
- Right, fluid: the **register** — virtualized 28px rows, hairline-ruled, with columns
  `favicon | title | domain | category | age | est. size`. Right three columns are numeric
  or short-token and right-aligned.

Density is the feature. 28px rows put ~20 tabs on screen in the popup-adjacent viewport
and ~28 in the dashboard at 1080p, versus ~10 for a typical card list.

## The signature element: the Balance Bar

One thing the product is remembered by.

The debt score is rendered as a statement balance — large tabular numerals, right-aligned,
with the traffic-light state as a low-saturation band behind it — and **directly beneath
it, a single 8px full-width stacked bar in which each segment is one scoring factor,
sized by its point contribution.**

```
  ACCOUNT BALANCE                                    ┌──────────┐
                                                     │  AMBER   │
                                              5 8    └──────────┘
  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░▒▒▒▒▒▒▒▒▓▓▓▓░░░░░░
  └ duplicates 18 ┘└ stale 12 ┘└ count 9 ┘└ …
```

Every segment is a button. Hovering names the factor and its points; clicking runs that
factor's remedy. So the chart *is* the control surface — the breakdown, the ranking, and
the one-click fix are one object rather than three stacked panels.

It animates on change: segments transition width over 150ms ease-out and the numeral
counts to its new value, so paying down debt is visibly felt. Both are suppressed under
`prefers-reduced-motion`, where the value swaps instantly.

## Motion

150ms ease-out, functional only: score delta, row collapse, toast arrival, filter-bar
change. No ambient animation, no spring physics, no entrance choreography. Every
transition is wrapped so `prefers-reduced-motion: reduce` drops it to 0ms.

## Copy

Diagnostic, never scolding. The score is a reading, not a verdict.

- Good: "23 GitHub tabs, 19 untouched for two weeks."
- Bad: "You have a tab problem."
- Buttons are the verb that happens: **"Close 19 duplicates."**
- Toasts are that verb in past tense: **"Closed 19 duplicates."** + Undo.
- Empty states invite: "Nothing stale here. Your oldest tab is from this morning."
- Errors say what happened and what to do next, and never blame the user.
