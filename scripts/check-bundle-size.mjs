#!/usr/bin/env node
/**
 * Budgets that are not enforced are wishes. This fails the build.
 *
 * The measurement follows each entry's real module graph — parse the entry HTML for its
 * scripts and stylesheets, then walk static imports transitively — rather than guessing
 * from chunk filenames. Rollup names chunks after whatever module happened to be the
 * root, so a filename match would silently measure the wrong thing.
 *
 * The popup budget is the load-bearing one: it is why this project uses Preact rather than
 * React, and hand-rolled primitives rather than a component library.
 */
import { readFile, access } from 'node:fs/promises';
import { join, dirname, resolve, relative } from 'node:path';
import { gzipSync } from 'node:zlib';

const DIST = 'dist';

const ENTRIES = [
  { name: 'popup', html: 'src/pages/popup/index.html', maxGzipKb: 120 },
  { name: 'dashboard', html: 'src/pages/dashboard/index.html', maxGzipKb: 220 },
  { name: 'options', html: 'src/pages/options/index.html', maxGzipKb: 160 },
  { name: 'service worker', js: 'service-worker-loader.js', maxGzipKb: 100 },
];

const exists = async (p) => access(p).then(() => true).catch(() => false);

/**
 * Static import specifiers, plus the dynamic-import form Vite emits for lazy chunks.
 *
 * These patterns must tolerate MINIFIED output: rollup emits `import{a}from"./x.js"` with
 * no whitespace and chains statements with `;`, so any pattern requiring `\s` around
 * `from` silently matches nothing and the budget under-reports to near zero.
 */
function importsOf(source) {
  const specs = [];
  const patterns = [
    /\bfrom\s*["']([^"']+)["']/g, // import … from "x"  /  export … from "x"
    /\bimport\s*["']([^"']+)["']/g, // bare side-effect import "x"
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g, // dynamic import("x")
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(source)) !== null) specs.push(m[1]);
  }
  return specs.filter((s) => s.startsWith('.') || s.startsWith('/'));
}

/** Collect an entry's full transitive asset set, following imports from the entry HTML. */
async function graphOf(entry) {
  const seen = new Set();
  const queue = [];

  if (entry.html) {
    const htmlPath = join(DIST, entry.html);
    if (!(await exists(htmlPath))) return null;
    const html = await readFile(htmlPath, 'utf8');
    const dir = dirname(entry.html);
    for (const re of [/<script[^>]+src=["']([^"']+)["']/g, /<link[^>]+href=["']([^"']+)["']/g]) {
      let m;
      while ((m = re.exec(html)) !== null) {
        const href = m[1];
        if (href.endsWith('.png') || href.endsWith('.ico')) continue;
        queue.push(href.startsWith('/') ? href.slice(1) : relative(DIST, resolve(DIST, dir, href)));
      }
    }
  } else if (entry.js) {
    if (!(await exists(join(DIST, entry.js)))) return null;
    queue.push(entry.js);
  }

  let bytes = 0;
  while (queue.length > 0) {
    const rel = queue.pop();
    if (seen.has(rel)) continue;
    seen.add(rel);
    const abs = join(DIST, rel);
    if (!(await exists(abs))) continue;
    const content = await readFile(abs);
    bytes += gzipSync(content).length;
    if (abs.endsWith('.js') || abs.endsWith('.mjs')) {
      for (const spec of importsOf(content.toString('utf8'))) {
        const next = spec.startsWith('/')
          ? spec.slice(1)
          : relative(DIST, resolve(DIST, dirname(rel), spec));
        queue.push(next);
      }
    }
  }

  return { bytes, files: seen.size };
}

let failed = 0;
let missing = 0;
console.log('Bundle budgets (gzipped, full transitive entry graph):\n');

for (const entry of ENTRIES) {
  const result = await graphOf(entry);
  if (!result) {
    console.error(`  ✗ ${entry.name.padEnd(16)} NOT BUILT — expected ${entry.html ?? entry.js}`);
    missing += 1;
    continue;
  }
  const kb = result.bytes / 1024;
  const ok = kb <= entry.maxGzipKb;
  if (!ok) failed += 1;
  console.log(
    `  ${ok ? '✓' : '✗'} ${entry.name.padEnd(16)} ${kb.toFixed(1).padStart(7)} KB / ${String(entry.maxGzipKb).padStart(3)} KB  (${result.files} files)`,
  );
}

if (missing > 0) {
  console.error(`\n✗ ${missing} entry point was not emitted by the build.`);
  process.exit(1);
}
if (failed > 0) {
  console.error(`\n✗ ${failed} bundle budget exceeded.`);
  process.exit(1);
}
console.log('\n✓ All bundle budgets met.');
