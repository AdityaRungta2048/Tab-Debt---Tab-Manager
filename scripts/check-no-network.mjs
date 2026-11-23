#!/usr/bin/env node
/**
 * Privacy guarantee, enforced against the BUILT bundle rather than the source we wrote.
 * A lint rule only covers our own code; a dependency that reaches for the network would
 * sail straight past it. See PRIVACY.md.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';

const DIST = 'dist';

// Word-boundary matched so `prefetch`, `refetchQueries` and similar do not false-positive.
const FORBIDDEN = [
  { pattern: /\bfetch\s*\(/, name: 'fetch()' },
  { pattern: /\bXMLHttpRequest\b/, name: 'XMLHttpRequest' },
  { pattern: /\bnew\s+WebSocket\b/, name: 'WebSocket' },
  { pattern: /\bnew\s+EventSource\b/, name: 'EventSource' },
  { pattern: /\bnavigator\s*\.\s*sendBeacon\b/, name: 'navigator.sendBeacon' },
  { pattern: /\bimportScripts\s*\(/, name: 'importScripts()' },
  // Any absolute remote URL in the bundle: a CDN script, a remote font, a tracking pixel.
  { pattern: /https?:\/\/(?!localhost|127\.0\.0\.1)[a-z0-9-]+\.[a-z]{2,}/i, name: 'remote URL' },
];

// URLs that legitimately appear as data, not as something we ever request.
const ALLOWED_STRINGS = [
  'http://www.w3.org/', // SVG/XML namespaces
  'https://www.w3.org/',
  'https://chromewebstore.google.com/detail/', // links the user can click, never fetched
];

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else yield path;
  }
}

let failures = 0;
let scanned = 0;

try {
  for await (const file of walk(DIST)) {
    if (!['.js', '.mjs', '.css', '.html'].includes(extname(file))) continue;
    scanned += 1;
    const raw = await readFile(file, 'utf8');
    // Strip the allowed literals before matching so they cannot mask a real hit elsewhere.
    const source = ALLOWED_STRINGS.reduce((acc, s) => acc.split(s).join(''), raw);

    for (const { pattern, name } of FORBIDDEN) {
      const match = source.match(pattern);
      if (match) {
        const line = source.slice(0, match.index).split('\n').length;
        console.error(`✗ ${file}:${line} contains ${name} — ${JSON.stringify(match[0].slice(0, 80))}`);
        failures += 1;
      }
    }
  }
} catch (err) {
  if (err.code === 'ENOENT') {
    console.error(`✗ ${DIST}/ not found. Run the build first.`);
    process.exit(1);
  }
  throw err;
}

if (failures > 0) {
  console.error(`\n✗ Privacy check failed: ${failures} network capability found in the bundle.`);
  console.error('  Tab Debt makes no network requests, ever. See PRIVACY.md.');
  process.exit(1);
}

console.log(`✓ Privacy check passed: no network capability in ${scanned} bundled files.`);
