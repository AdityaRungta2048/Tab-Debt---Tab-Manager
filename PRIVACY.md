# Privacy Policy — Tab Debt

**Last updated:** 2026-08-03

## The short version

Tab Debt makes no network requests. Not to us, not to anyone. There is no server to send
your data to, because there is no server.

## What Tab Debt can see

To do its job, Tab Debt reads metadata about your open tabs:

- Page title and address (URL)
- Which window a tab is in, and its position
- Whether it is pinned, playing audio, muted, or discarded by Chrome
- When it was last active
- Which tab group it belongs to

It does **not** read the content of any page. It has no content scripts and no host
permissions, so it has no ability to see what is on a page — only that the tab is open.

## What Tab Debt stores, and where

Everything is stored in `chrome.storage.local`, which lives on your computer inside your
Chrome profile:

- Your settings: comfortable tab baseline, theme, category overrides, tracking-parameter
  list, memory heuristic weights
- Activity records: when each open tab was last active, so staleness can be measured
- Undo history: the last few bulk operations, so they can be reversed
- Archived tabs: title, address, site and category for tabs you chose to archive
- Saved sessions: the tabs you explicitly named and saved
- Daily aggregates: one row per day holding total tab count, debt score, and counts per
  category. These are **totals only** — no per-tab history is retained, and rows older than
  180 days are deleted automatically.

None of it is synced. `chrome.storage.sync` is not used, so nothing crosses between your
devices or touches Google's sync servers.

## What Tab Debt sends

Nothing.

- No analytics, no telemetry, no crash reporting, no usage statistics
- No accounts, no sign-in, no identifiers
- No remote fonts, stylesheets, scripts or images
- No CDN of any kind
- Favicons are read from Chrome's own local cache, never fetched over the network — fetching
  them remotely would leak your browsing history to third parties

This is enforced, not merely promised. A check runs on every build and **fails the build**
if `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `navigator.sendBeacon`,
`importScripts` or any remote URL appears anywhere in the shipped code. A lint rule bans the
same globals in source. The extension's content security policy (`script-src 'self'`) blocks
remote code even if something slipped through.

## Third parties

There are none. No service providers, no processors, no advertisers, no partners. Your data
is never sold, shared, rented or disclosed, because it never leaves your machine.

## Your control

- **Export** — Settings → "Export a copy" writes a JSON file to your computer with
  everything Tab Debt has stored about you.
- **Delete** — Settings → "Delete all data" erases all of it immediately. Your tabs are not
  affected.
- **Uninstall** — removing the extension deletes everything it stored, permanently.

## Children

Tab Debt is a browser utility with no accounts, no content and no communication features. It
collects nothing from anyone, of any age.

## Changes

If this policy ever changes, the change ships with a new version of the extension and this
file is updated in the public repository alongside it. Since the extension has no network
access, a policy change cannot retroactively affect data that was never transmitted.

## Contact

Questions or concerns: open an issue on the project's GitHub repository.
