# PERMISSIONS

Seven permissions. No host permissions, no content scripts, no `<all_urls>`.

Each justification below is written in the language it would be pasted into the Chrome Web
Store review form.

---

### `tabs`

> Tab Debt's single purpose is to help users understand and reduce a large accumulation of
> open tabs. The `tabs` permission is what makes that possible: the extension reads each
> tab's title, URL, window, pinned/audible/discarded state and last-accessed time in order
> to count duplicates, measure how long tabs have gone untouched, group them by site and
> category, and compute the "debt score" that is the product's core feature. It also uses
> `tabs` to act on the user's explicit instruction — switching to a tab, closing a selected
> set, pinning or muting. No tab data is transmitted anywhere; it is read, analysed locally,
> and displayed to the user who owns it.

### `storage`

> Used to store the user's own settings (comfortable tab baseline, theme, category
> overrides, tracking-parameter list, memory heuristic weights), the undo history that lets
> a user reverse any bulk action, archived tab metadata, saved sessions, and per-day
> aggregate counts for the trend view. All of it is written to `storage.local` on the user's
> own machine. Nothing is synced to a server and nothing is transmitted off the device.

### `alarms`

> The extension records one aggregate snapshot per day (tab count, debt score, per-category
> counts) so it can show the user whether their tab debt is growing or shrinking over time,
> and periodically prunes stored activity records for tabs that no longer exist. Manifest V3
> service workers are terminated aggressively, so `chrome.alarms` is the only reliable way
> to schedule that work — `setTimeout` does not survive worker termination.

### `bookmarks`

> Used for the "bookmark and close" action, which is the safety mechanism behind every large
> cleanup. Before closing a group of tabs, the extension saves them into a dated folder under
> a "Tab Debt" folder in the user's bookmarks, so nothing is lost. If any bookmark cannot be
> written, no tabs are closed at all. The extension only creates bookmarks the user has
> explicitly asked for; it never reads, modifies or deletes the user's existing bookmarks
> beyond locating or creating its own folder.

### `favicon`

> Used to display each site's icon next to its tab in the list, so users can visually scan
> hundreds of rows. The icons are read from Chrome's own local favicon cache via the
> `_favicon/` endpoint. The extension deliberately does **not** fetch favicons from the
> network, which would leak the user's browsing history to third-party servers and would
> contradict the extension's privacy guarantee.

### `tabGroups`

> Grouping is frequently a better answer than closing, and it is offered as a first-class
> action: a user with 27 tabs from one site can collapse them into a named, collapsed tab
> group instead of losing them. The permission is also required for the undo feature — when
> a bulk action is reversed, the extension restores the tabs' original group membership and
> group names, which it cannot do without reading and setting group properties.

---

## Deliberately not requested

| Permission | Why not |
|---|---|
| `sessions` | Requested in 1.0.0 and removed in 1.0.1 as unused. Tab Debt's named save/restore is its own `storage.local` feature (D-016) because `chrome.sessions` is a recently-closed list, not a named-session store; the recently-closed reader that would have justified the API was never built. Nothing may re-add this permission until code actually calls `chrome.sessions`. |
| `<all_urls>` / host permissions | Everything Tab Debt needs is tab *metadata*. Page content is never read. Requesting host access would grant the ability to read every page the user visits, for zero product benefit, and would rightly trigger a much harsher review. |
| Content scripts | Same reason. No code is injected into any page. |
| `history` | Tab Debt is about tabs that are open now, not pages visited in the past. |
| `downloads` | Data export writes a local blob URL from the options page; no permission needed. |
| `management`, `cookies`, `webRequest`, `scripting` | Unused. Each would be a significant privacy expansion for no feature. |

## Single-purpose statement

> Tab Debt helps users reduce a large number of open browser tabs. It measures how many tabs
> are open, how many are duplicates, and how long each has gone unused; presents a single
> diagnostic score with a breakdown; and offers reversible bulk actions — close, group,
> bookmark-and-close, archive — to reduce that number. Every feature serves that one purpose.

## Remote code

None. The extension bundles all of its code. The content security policy is
`script-src 'self'; object-src 'self'`, no remote scripts, styles or fonts are loaded, and
a build-time check (`scripts/check-no-network.mjs`) fails the build if `fetch`,
`XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`, `importScripts` or any remote
URL appears anywhere in the built output.
