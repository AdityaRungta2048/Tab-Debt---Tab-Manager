#!/usr/bin/env node
/**
 * Every declared permission must be called by shipping code.
 *
 * Version 1.0.0 was rejected by the Chrome Web Store (violation "Purple Potassium":
 * requesting but not using a permission) for shipping `sessions` while DECISIONS.md D-016
 * explained at length that we deliberately never call `chrome.sessions`. The manifest and
 * the code disagreed, and only the review caught it. This makes the build catch it.
 *
 * Scanned against source rather than the built bundle — the opposite of check-no-network,
 * and deliberately so. Network capability can arrive from a dependency, so that check has to
 * read dist/. Extension permissions can only be exercised by our own code (no dependency
 * touches `chrome.*`), and source survives minification's global-aliasing with no ambiguity.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';

const SRC = 'src';
const DIST_MANIFEST = 'dist/manifest.json';
const MANIFEST_CONFIG = 'src/manifest.config.ts';

/**
 * How each permission proves it is used. A permission with no entry here fails the check:
 * adding one to the manifest must mean stating what would demonstrate it is live.
 */
const PROOF_OF_USE = {
  tabs: { pattern: /\bchrome\s*\.\s*tabs\s*\./, describes: 'chrome.tabs.*' },
  storage: { pattern: /\bchrome\s*\.\s*storage\s*\./, describes: 'chrome.storage.*' },
  alarms: { pattern: /\bchrome\s*\.\s*alarms\s*\./, describes: 'chrome.alarms.*' },
  bookmarks: { pattern: /\bchrome\s*\.\s*bookmarks\s*\./, describes: 'chrome.bookmarks.*' },
  tabGroups: { pattern: /\bchrome\s*\.\s*tabGroups\s*\./, describes: 'chrome.tabGroups.*' },
  sessions: { pattern: /\bchrome\s*\.\s*sessions\s*\./, describes: 'chrome.sessions.*' },
  notifications: {
    pattern: /\bchrome\s*\.\s*notifications\s*\./,
    describes: 'chrome.notifications.*',
  },
  // Not an API: it unlocks the chrome://favicon-backed /_favicon/ URL endpoint.
  favicon: { pattern: /_favicon\//, describes: 'the /_favicon/ URL endpoint' },
};

// Tests and mocks prove nothing about the shipped extension — a mock of chrome.sessions is
// exactly the kind of thing that would have masked the 1.0.0 rejection.
const EXCLUDED = [/\.test\.[tj]sx?$/, /[\\/]test[\\/]/, /[\\/]mocks?[\\/]/];

/**
 * Strip comments so prose about an API never counts as calling it. This is the crux: the
 * codebase is full of "chrome.sessions.restore is deliberately not used" notes, and a naive
 * scan would read those as proof of use and re-ship the rejected manifest.
 */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '') // block and JSDoc
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) return '';
      // Trailing comments, but never a URL's "//" — require no ':' immediately before.
      return line.replace(/(^|[^:])\/\/.*$/, '$1');
    })
    .join('\n');
}

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else yield path;
  }
}

/** Prefer the built manifest; fall back to source so this runs without a build. */
async function readDeclaredPermissions() {
  try {
    const manifest = JSON.parse(await readFile(DIST_MANIFEST, 'utf8'));
    return { permissions: manifest.permissions ?? [], from: DIST_MANIFEST };
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  const config = await readFile(MANIFEST_CONFIG, 'utf8');
  const match = config.match(/permissions\s*:\s*\[([^\]]*)\]/);
  if (!match) {
    console.error(`✗ Could not find a permissions array in ${MANIFEST_CONFIG}.`);
    process.exit(1);
  }
  const permissions = [...match[1].matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]);
  return { permissions, from: MANIFEST_CONFIG };
}

const { permissions, from } = await readDeclaredPermissions();

// One pass over the source; record where each permission is first proven.
const evidence = new Map();
let scanned = 0;

for await (const file of walk(SRC)) {
  if (!['.ts', '.tsx'].includes(extname(file))) continue;
  if (EXCLUDED.some((re) => re.test(file))) continue;
  if (file.endsWith('manifest.config.ts')) continue; // declares, never calls
  scanned += 1;

  const source = stripComments(await readFile(file, 'utf8'));
  for (const permission of permissions) {
    if (evidence.has(permission)) continue;
    const proof = PROOF_OF_USE[permission];
    if (!proof) continue;
    const match = source.match(proof.pattern);
    if (match) {
      const line = source.slice(0, match.index).split('\n').length;
      evidence.set(permission, `${file}:${line}`);
    }
  }
}

const unused = [];
const unknown = [];

for (const permission of permissions) {
  if (!PROOF_OF_USE[permission]) unknown.push(permission);
  else if (!evidence.has(permission)) unused.push(permission);
}

for (const permission of permissions) {
  if (evidence.has(permission)) {
    console.log(`  ✓ ${permission} — ${evidence.get(permission)}`);
  }
}

if (unknown.length > 0) {
  console.error(`\n✗ No usage rule defined for: ${unknown.join(', ')}`);
  console.error('  Add an entry to PROOF_OF_USE in this script stating what proves it is used,');
  console.error('  and a justification to PERMISSIONS.md, before declaring it.');
}

if (unused.length > 0) {
  console.error(`\n✗ Declared but never used: ${unused.join(', ')}`);
  for (const permission of unused) {
    console.error(`    ${permission}: no ${PROOF_OF_USE[permission].describes} in ${SRC}/`);
  }
  console.error('  The Chrome Web Store rejects this ("Purple Potassium"). Remove the');
  console.error('  permission from src/manifest.config.ts, or ship the code that uses it.');
}

if (unused.length > 0 || unknown.length > 0) process.exit(1);

console.log(
  `\n✓ Permission check passed: ${permissions.length} declared in ${from}, all used (${scanned} source files).`,
);
