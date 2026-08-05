/**
 * Renders the extension icons from one vector source, so the PNGs in src/assets are a
 * build output rather than three unexplained binaries nobody can edit.
 *
 *   node scripts/render-icons.mjs
 *
 * The mark is a browser window with one tab, and inside it the Balance Bar broken into
 * its factor segments — the same signature element the popup and dashboard are built
 * around (DESIGN.md). At 16px a faithful reduction collapses: the third segment is 8
 * units wide, which lands on a single grey pixel and reads as dirt. So the small size
 * gets its own optical cut with two heavier segments and a wider tab, rather than a
 * scaled-down copy.
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const EXECUTABLE = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const launchOptions = existsSync(EXECUTABLE) ? { executablePath: EXECUTABLE } : {};

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../src/assets');
mkdirSync(OUT, { recursive: true });

const TAB =
  'M1 30 c6 0 8.5-3.5 10-8 L13.5 13 c1.5-4.5 4.5-7 9-7 h27 c4.5 0 7.5 2.5 9 7 l2.5 9 c1.5 4.5 4 8 10 8 z';

const full = (r) => `
<rect width="128" height="128" rx="${r}" fill="url(#bg)"/>
<path d="${TAB}" transform="translate(21 24) scale(0.62 0.86)" fill="#fff"/>
<rect x="19" y="47" width="90" height="58" rx="11" fill="#fff"/>
<rect x="31" y="67" width="38" height="19" rx="6" fill="#2d4b7c"/>
<rect x="72" y="67" width="17" height="19" rx="6" fill="#5f82bb"/>
<rect x="92" y="67" width="8"  height="19" rx="6" fill="#9db9e4"/>`;

const small = (r) => `
<rect width="128" height="128" rx="${r}" fill="url(#bg)"/>
<path d="${TAB}" transform="translate(20 22) scale(0.72 1.0)" fill="#fff"/>
<rect x="18" y="48" width="92" height="60" rx="12" fill="#fff"/>
<rect x="30" y="66" width="44" height="24" rx="7" fill="#2d4b7c"/>
<rect x="78" y="66" width="20" height="24" rx="7" fill="#7fa3dc"/>`;

const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#3a5c95"/><stop offset="1" stop-color="#22406f"/>
</linearGradient></defs>${body}</svg>`;

const browser = await chromium.launch(launchOptions);

async function png(name, size, body) {
  const page = await browser.newPage({
    viewport: { width: size, height: size },
    deviceScaleFactor: 1,
  });
  // Vector-scaled at the target size rather than downsampled from 128, which keeps the
  // 16px edges crisp instead of grey.
  await page.setContent(
    `<style>html,body{margin:0;padding:0;background:transparent}
     svg{display:block;width:${size}px;height:${size}px}</style>${svg(body)}`,
  );
  await page.waitForTimeout(120);
  await page.screenshot({ path: `${OUT}/${name}`, omitBackground: true });
  await page.close();
  console.log(`${name}  ${size}x${size}`);
}

// The corner radius is cut per size: 28/128 held at 16px would eat the mark.
await png('icon-128.png', 128, full(28));
await png('icon-48.png', 48, full(11));
await png('icon-16.png', 16, small(4));

await browser.close();
