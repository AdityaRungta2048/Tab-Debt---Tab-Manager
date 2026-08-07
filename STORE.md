# Chrome Web Store submission guide

Everything needed to fill in the listing and the review form, plus the rejection reasons
that specifically catch tab managers and how this build already avoids each.

---

## Listing copy

### Name
`Tab Debt`

### Short description (132 char max)
> See what your open tabs actually cost, and pay the debt down one reversible step at a time.
> Nothing leaves your computer.

*(126 characters.)*

### Detailed description

> **You don't have a tab problem. You have tab debt.**
>
> Most tab managers do one of two things: list your tabs, which is useless at 400, or offer
> to close them all, which is terrifying — so nobody does it.
>
> Tab Debt treats your tabs as a balance you've accumulated. It tells you honestly what you
> owe, shows you exactly which chunk to pay off first and what it costs, and makes paying it
> off a single action you can undo.
>
> **See what you owe**
> One score, 0–100, broken down into the things that actually caused it: how many tabs are
> open, how many are duplicates, how many you haven't touched in weeks, how many you never
> opened at all. Every line has a one-click fix next to it.
>
> **Find the duplicates you didn't know about**
> Three kinds, shown separately because they're not equally safe to close: identical
> addresses, the same page with different tracking parameters, and the same page with a
> different search. Nothing is ever closed automatically. Pinned tabs, tabs playing audio,
> drafts, and documents you might have unsaved work in are never selected for you.
>
> **Undo everything**
> Close 100 tabs and change your mind. They come back — in the right windows, still pinned,
> still grouped. Undo lives in a history panel too, not just a toast that vanishes, because
> people notice their mistake two minutes later.
>
> **Nothing leaves your computer**
> No accounts. No servers. No analytics. No tracking. Tab Debt makes no network requests at
> all — this is checked automatically on every build, not just promised. It can't read the
> content of your pages; it only sees tab titles and addresses.
>
> **Built for real tab counts**
> Search responds in under 16ms with 800 tabs open. The list is virtualised. Light and dark
> themes, full keyboard control, and screen-reader labels throughout.

### Category
`Productivity` → Workflow & Planning

### Language
English (UK/US neutral)

---

## Review form answers

### Single purpose

> Tab Debt helps users reduce a large number of open browser tabs. It measures how many tabs
> are open, how many are duplicates, and how long each has gone unused; presents a single
> diagnostic score with a breakdown; and offers reversible bulk actions — close, group,
> bookmark-and-close, archive — to reduce that number. Every feature serves that one purpose.

### Permission justifications

Copy the per-permission text verbatim from [PERMISSIONS.md](PERMISSIONS.md). All six are
written in review-form language. Summary of what to paste:

| Permission | One-line justification |
|---|---|
| `tabs` | Read tab metadata to count, categorise, deduplicate and score; act on user instruction to close/switch/pin/mute. |
| `storage` | Store the user's settings, undo history, archive and per-day aggregates locally. |
| `alarms` | Schedule the daily aggregate snapshot and record pruning; MV3 workers are terminated, so timers don't survive. |
| `bookmarks` | "Bookmark and close" saves tabs to a dated Tab Debt folder before closing them. |
| `favicon` | Show site icons from Chrome's local cache so users can scan hundreds of rows — never fetched over the network. |
| `tabGroups` | Grouping is offered instead of closing, and undo restores original group membership and names. |

There is no `sessions` row. It was requested in 1.0.0 without being used and was rejected for
exactly that (Purple Potassium — "requesting but not using"). Every row above is called by
shipping code; check that this stays true before each submission.

### Are you using remote code?
**No.** All code is bundled. CSP is `script-src 'self'; object-src 'self'`.

### Data usage disclosures
Tick **nothing**. Then confirm all three certifications:
- Not being sold to third parties ✓
- Not being used for purposes unrelated to the single purpose ✓
- Not being used to determine creditworthiness or for lending ✓

### Privacy policy URL
Link to the hosted copy of [PRIVACY.md](PRIVACY.md).

---

## Screenshots

Five, at **1280×800** (the size that displays largest in the store). Take them against the
800-tab fixture with `npm run dev:mock` — it produces a realistic, dense, non-embarrassing
tab set with no real personal data in it.

| # | Shows | Caption |
|---|---|---|
| 1 | Dashboard, light, register view. Balance Bar reading amber/red with the factor breakdown visible in the rail. | "One score. Every point accounted for." |
| 2 | The suggestions rail, with a suggestion expanded to show its preview list. | "The highest-leverage move, previewed before anything happens." |
| 3 | Duplicates panel, showing all three tiers with keep/close side by side and a protected tab labelled "Pinned". | "Three kinds of duplicate. Nothing closes automatically." |
| 4 | The undo toast immediately after a bulk close, with the "cannot restore" line legible. | "Close 100 tabs. Change your mind." |
| 5 | Dashboard in dark theme, search active with results. | "Instant search across 800 tabs. Light and dark." |

Also supply the **128×128 store icon** — `src/assets/icon-128.png`, rendered by
`npm run icons` from `src/assets/icon.svg` — and, optionally, a 1400×560 marquee.

Screenshot rules to respect: no browser chrome around the image, no added marketing text
overlaying the UI beyond the caption field, and the screenshot must show the actual product.

---

## Rejection reasons that specifically catch tab managers

Ordered by how often they bite this category.

### 1. Requesting `<all_urls>` or host permissions "just in case"
The most common one. Tab managers ask for host access to read page titles more reliably, or
to inject a content script, and get a far harsher review — often a rejection with
"broad host permissions not justified by the described functionality".

**This build:** requests no host permissions and has no content scripts. All tab metadata
comes from the `tabs` permission. If a future feature seems to need a content script, it is
solving the wrong problem.

### 2. Permission justifications that restate the permission name
"We need the tabs permission to access tabs" gets rejected. Reviewers want the *user-facing
feature* each permission enables.

**This build:** every justification in PERMISSIONS.md names the concrete feature and states
that nothing is transmitted. Paste them verbatim.

### 3. Single-purpose violation via feature sprawl
Tab managers accumulate bookmark managers, note-takers, session sync, reading lists — and
get rejected for "multiple unrelated purposes".

**This build:** bookmarks are used *only* as the safety net for closing tabs, sessions only
for saving and restoring tab sets. There is no note-taking, no reading view, no sync. The
Phase 3 list in ROADMAP.md is deliberately bounded for the same reason.

### 4. Undisclosed data collection
Anything that phones home — even error reporting — must be disclosed, and a mismatch between
the disclosure and observed network traffic is a hard rejection.

**This build:** makes no network requests at all, enforced by
`scripts/check-no-network.mjs` failing the build. Tick nothing on the data form.

### 5. Remote favicon fetching
A very common quiet violation: fetching `https://www.google.com/s2/favicons?domain=…` sends
the user's entire open-tab list to a third party. Reviewers increasingly catch this, and it
contradicts any privacy claim in the listing.

**This build:** uses the `favicon` permission and Chrome's local `_favicon/` endpoint. The
build check treats any remote URL in the bundle as a failure.

### 6. Remote code / CDN-loaded scripts
MV3 forbids remote code outright. A CDN `<script>`, a remote font, or `eval` will fail.

**This build:** everything is bundled, CSP is `script-src 'self'`, and the privacy check
scans the built output for remote URLs.

### 7. Destructive behaviour without user control
An extension that closes tabs on a timer, or on install, or without confirmation gets
rejected — and deserves to.

**This build:** nothing is ever closed automatically. Every destructive action is
preview → execute → toast with undo, plus a permanent undo history. Large sweeps bookmark
first, and if any bookmark fails, nothing is closed at all.

### 8. Keyword-stuffed or misleading listing copy
Titles like "Tab Manager — Best Tab Organizer, Session Buddy, OneTab Alternative" get
rejected for keyword spam and for referencing other products.

**This build's** listing names no competitor and describes only what the extension does.

### 9. Broken or missing icons at required sizes
16, 48 and 128 are all present in `src/assets/` and referenced in the manifest.

---

## Pre-submission checklist

- [ ] `npm run verify` fully green
- [ ] `npm run check:a11y` green
- [ ] Manual QA checklist in TESTING.md completed against a real profile with 100+ tabs
- [ ] Service worker console clean, and survives manual termination
- [ ] Version bumped in `src/manifest.config.ts`
- [ ] `dist/` zipped from **inside** the folder (the manifest must be at the zip root)
- [ ] Privacy policy hosted at a public URL and linked
- [ ] Five screenshots at 1280×800
- [ ] Permission justifications pasted from PERMISSIONS.md
- [ ] Data-use form: nothing ticked, all three certifications confirmed
