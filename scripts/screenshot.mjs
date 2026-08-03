import { chromium } from 'playwright';
const OUT = '/tmp/claude-0/-home-user-Tab-Debt-Cleaner/ef9b1e72-9314-5100-9f6b-23d32eb1520f/scratchpad/shots';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const errors = [];

async function shot(name, fixture, theme, work) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${name}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[${name}] PAGEERROR ${e.message}`));
  const t0 = Date.now();
  await page.goto(`http://localhost:5173/?fixture=${fixture}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[role="grid"]', { timeout: 15000 });
  const interactive = Date.now() - t0;
  if (work) await work(page);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
  console.log(`${name}: interactive in ~${interactive}ms`);
  await ctx.close();
}

await shot('dash-800-light', 800, 'light');
await shot('dash-800-dark', 800, 'dark');
await shot('dash-50-light', 50, 'light');
await shot('dash-800-dupes', 800, 'light', async (p) => {
  await p.getByRole('button', { name: 'duplicates', exact: true }).click();
  await p.waitForTimeout(300);
});
await shot('dash-800-search', 800, 'light', async (p) => {
  await p.getByRole('searchbox').fill('github pull');
  await p.waitForTimeout(300);
});
await shot('dash-800-selected', 800, 'light', async (p) => {
  const boxes = p.locator('[role="row"] input[type=checkbox]');
  for (let i = 0; i < 4; i++) await boxes.nth(i).click();
  await p.waitForTimeout(200);
});

console.log(errors.length ? `\nCONSOLE ERRORS:\n${errors.join('\n')}` : '\nNo console errors.');
await browser.close();
