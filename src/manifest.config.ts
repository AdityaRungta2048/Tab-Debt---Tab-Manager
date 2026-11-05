import { defineManifest } from '@crxjs/vite-plugin';

// Every permission here is justified in store-review language in PERMISSIONS.md, and every
// one of them is called by shipping code — an unused permission is a store rejection.
// Deliberately absent: host permissions and content scripts. Tab metadata is all this
// product needs, and <all_urls> would trigger a far harsher review for zero benefit.
// Also absent: `sessions`. Named save/restore is our own storage.local feature (D-016), and
// the recently-closed reader that would have used the API was never built.
export default defineManifest({
  manifest_version: 3,
  name: 'Tab Debt - Tab Manager',
  version: '1.0.2',
  description: 'See what your open tabs actually cost, and pay the debt down one reversible step at a time.',
  minimum_chrome_version: '121', // tabs.lastAccessed landed in 121 and is our staleness seed.
  permissions: ['tabs', 'storage', 'alarms', 'bookmarks', 'favicon', 'tabGroups'],
  action: {
    default_popup: 'src/pages/popup/index.html',
    default_title: 'Tab Debt',
  },
  options_page: 'src/pages/options/index.html',
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  icons: {
    16: 'src/assets/icon-16.png',
    48: 'src/assets/icon-48.png',
    128: 'src/assets/icon-128.png',
  },
  commands: {
    _execute_action: {
      suggested_key: { default: 'Ctrl+Shift+K', mac: 'Command+Shift+K' },
      description: 'Open Tab Debt triage',
    },
  },
  // No remote code, no eval, no network. Mirrors the guarantee in PRIVACY.md.
  content_security_policy: {
    extension_pages: "script-src 'self'; object-src 'self';",
  },
});
