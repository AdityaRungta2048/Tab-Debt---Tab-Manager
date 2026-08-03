import { chromium } from 'playwright';
const OUT = process.env.SHOT_DIR ?? '/tmp/claude-0/-home-user-Tab-Debt-Cleaner/ef9b1e72-9314-5100-9f6b-23d32eb1520f/scratchpad/shots';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const errors = [];

async function shot(name, fixture, theme, work) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('_favicon')) errors.push(`[${name}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[${name}] PAGEERROR ${e.message}`));
  const t0 = Date.now();
  await page.goto(`http://localhost:5173/?fixture=${fixture}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('nav[aria-label="Views"]', { timeout: 15000 });
  const interactive = Date.now() - t0;
  if (work) await work(page);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`${name}: interactive in ~${interactive}ms`);
  await ctx.close();
}

const view = (name) => async (p) => { await p.getByRole('button', { name, exact: true }).click(); await p.waitForTimeout(300); };

await shot('dash-800-light', 800, 'light');
await shot('dash-800-dark', 800, 'dark');
await shot('dash-800-domains', 800, 'light', view('domains'));
await shot('dash-800-sessions', 800, 'light', view('sessions'));
await shot('dash-800-dupes', 800, 'light', view('duplicates'));
await shot('dash-800-filtered', 800, 'light', async (p) => {
  await p.getByRole('button', { name: 'Stale', exact: true }).click();
  await p.getByRole('button', { name: 'Never opened', exact: true }).click();
  await p.waitForTimeout(300);
});
await shot('dash-800-domains-filtered', 800, 'light', async (p) => {
  await view('domains')(p);
  await p.getByRole('button', { name: 'Stale', exact: true }).click();
  await p.waitForTimeout(300);
});

console.log(errors.length ? `\nCONSOLE ERRORS:\n${errors.join('\n')}` : '\nNo console errors.');
await browser.close();
