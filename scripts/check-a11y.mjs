import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const fails = [];
const pass = [];

// --- Keyboard-only traversal + visible focus -----------------------------------------
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto('http://localhost:5173/?fixture=400', { waitUntil: 'networkidle' });
  await page.waitForSelector('[role="grid"]');

  const seen = [];
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const s = getComputedStyle(el);
      const label = el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 40) || el.tagName;
      return { tag: el.tagName, label, outline: s.outlineWidth, outlineStyle: s.outlineStyle };
    });
    if (info) seen.push(info);
  }
  if (seen.length < 10) fails.push(`Only ${seen.length} focusable stops in 25 tabs`);
  else pass.push(`Keyboard traversal reaches ${seen.length} controls`);

  const unlabelled = seen.filter((s) => !s.label || s.label === s.tag);
  if (unlabelled.length) fails.push(`${unlabelled.length} focusable controls with no accessible name`);
  else pass.push('Every focusable control has an accessible name');

  // :focus-visible only paints on keyboard focus, which is what we just did.
  const noOutline = seen.filter((s) => s.outlineStyle === 'none' || s.outline === '0px');
  if (noOutline.length) fails.push(`${noOutline.length} controls without a visible focus ring`);
  else pass.push('All keyboard-focused controls show a focus ring');
  await ctx.close();
}

// --- Icon-only / image controls have text alternatives --------------------------------
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto('http://localhost:5173/?fixture=400', { waitUntil: 'networkidle' });
  await page.waitForSelector('[role="grid"]');
  const bad = await page.evaluate(() => {
    const out = [];
    for (const img of document.querySelectorAll('img')) {
      if (img.getAttribute('alt') === null) out.push('img without alt attribute');
    }
    for (const b of document.querySelectorAll('button')) {
      const text = (b.textContent || '').trim();
      const label = b.getAttribute('aria-label') || b.getAttribute('title');
      if (!text && !label) out.push(`empty button: ${b.className.slice(0, 40)}`);
    }
    for (const i of document.querySelectorAll('input')) {
      const label = i.getAttribute('aria-label') || i.getAttribute('aria-labelledby');
      if (!label && !i.labels?.length) out.push(`unlabelled input type=${i.type}`);
    }
    return out;
  });
  if (bad.length) fails.push(`Missing text alternatives: ${[...new Set(bad)].join('; ')}`);
  else pass.push('All images, icon buttons and inputs carry text alternatives');
  await ctx.close();
}

// --- prefers-reduced-motion ------------------------------------------------------------
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto('http://localhost:5173/?fixture=400', { waitUntil: 'networkidle' });
  await page.waitForSelector('[role="grid"]');
  const durations = await page.evaluate(() =>
    [...document.querySelectorAll('*')]
      .map((el) => getComputedStyle(el).transitionDuration)
      .filter((d) => d && d !== '0s' && parseFloat(d) > 0.05),
  );
  if (durations.length) fails.push(`${durations.length} elements still animate under prefers-reduced-motion`);
  else pass.push('prefers-reduced-motion suppresses all transitions');
  await ctx.close();
}

// --- Contrast (WCAG AA) on real rendered text -----------------------------------------
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  for (const scheme of ['light', 'dark']) {
    const page = await ctx.newPage();
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('http://localhost:5173/?fixture=400', { waitUntil: 'networkidle' });
    await page.waitForSelector('[role="grid"]');
    const low = await page.evaluate(() => {
      const lum = (c) => {
        const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const parse = (s) => (s.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
      const bgOf = (el) => {
        let n = el;
        while (n && n !== document.documentElement) {
          const bg = getComputedStyle(n).backgroundColor;
          const p = parse(bg);
          if (p.length === 3 && !/rgba\(.*,\s*0\)/.test(bg)) return p;
          n = n.parentElement;
        }
        return [255, 255, 255];
      };
      const out = [];
      for (const el of document.querySelectorAll('span,p,button,a,h1,h2,h3,div,li')) {
        const txt = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join('');
        if (!txt) continue;
        const s = getComputedStyle(el);
        if (s.visibility === 'hidden' || s.display === 'none') continue;
        const size = parseFloat(s.fontSize);
        const weight = Number(s.fontWeight) || 400;
        const large = size >= 24 || (size >= 18.66 && weight >= 700);
        const fg = parse(s.color);
        const bg = bgOf(el);
        if (fg.length !== 3) continue;
        const l1 = lum(fg), l2 = lum(bg);
        const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
        const need = large ? 3 : 4.5;
        if (ratio < need) out.push({ txt: txt.slice(0, 28), ratio: +ratio.toFixed(2), need, size, color: s.color });
      }
      return out;
    });
    if (low.length) {
      const uniq = [...new Map(low.map((x) => [x.color + x.need, x])).values()];
      fails.push(`${scheme}: ${low.length} low-contrast text nodes, e.g. ` +
        uniq.slice(0, 4).map((x) => `"${x.txt}" ${x.ratio}:1 (needs ${x.need})`).join(', '));
    } else pass.push(`${scheme}: all rendered text meets WCAG AA`);
    await page.close();
  }
  await ctx.close();
}

console.log('PASS:'); pass.forEach((p) => console.log('  ✓ ' + p));
if (fails.length) { console.log('\nFAIL:'); fails.forEach((f) => console.log('  ✗ ' + f)); }
await browser.close();
process.exit(fails.length ? 1 : 0);
