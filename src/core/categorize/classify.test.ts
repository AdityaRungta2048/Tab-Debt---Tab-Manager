import { describe, it, expect } from 'vitest';
import { classify, classifyAll } from './classify';
import type { Category, RuleTier } from '@/types/tab';
import { generateFixture } from '@/test/fixtures/generate';

type Row = [url: string, title: string, category: Category, tier: RuleTier];

/**
 * The classification table. Every tier is represented, and the expected TIER is asserted
 * alongside the category — a right answer from the wrong rule is a latent bug, because it
 * means the rule you think is firing is dead.
 */
const TABLE: Row[] = [
  // --- Tier 2: domain allow-list -------------------------------------------------------
  ['https://github.com/vitejs/vite', 'vitejs/vite', 'Development', 'domain'],
  ['https://github.com/a/b/pull/12', 'PR #12', 'Development', 'domain'],
  ['https://gitlab.com/x/y', 'x/y', 'Development', 'domain'],
  ['https://stackoverflow.com/questions/1', 'How to', 'Development', 'domain'],
  ['https://serverfault.stackexchange.com/q/2', 'Q', 'Development', 'domain'],
  ['https://developer.mozilla.org/en-US/docs/Web/API/fetch', 'fetch - MDN', 'Development', 'domain'],
  ['http://localhost:5173/', 'Vite + Preact', 'Development', 'domain'],
  ['http://127.0.0.1:8080/', 'Local', 'Development', 'domain'],
  ['https://www.npmjs.com/package/zod', 'zod - npm', 'Development', 'domain'],
  ['https://caniuse.com/flexbox', 'Can I use', 'Development', 'domain'],
  ['https://docs.google.com/document/d/x/edit', 'Q3 Planning', 'Work', 'domain'],
  ['https://mail.google.com/mail/u/0/#inbox', 'Inbox', 'Work', 'domain'],
  ['https://calendar.google.com/calendar/u/0/r', 'Calendar', 'Work', 'domain'],
  ['https://www.notion.so/Engineering-abc', 'Engineering Handbook', 'Work', 'domain'],
  ['https://www.figma.com/file/abc/Design', 'Design System', 'Work', 'domain'],
  ['https://linear.app/team/ENG/issue/ENG-1', 'ENG-1', 'Work', 'domain'],
  ['https://app.slack.com/client/T1/C1', 'Slack', 'Work', 'domain'],
  ['https://trello.com/b/abc', 'Board', 'Work', 'domain'],
  ['https://www.coursera.org/learn/ml', 'Machine Learning', 'Learning', 'domain'],
  ['https://www.udemy.com/course/react', 'React', 'Learning', 'domain'],
  ['https://en.wikipedia.org/wiki/Debt', 'Debt - Wikipedia', 'Learning', 'domain'],
  ['https://arxiv.org/abs/2401.00001', 'Paper', 'Learning', 'domain'],
  ['https://www.netflix.com/watch/123', 'Show', 'Entertainment', 'domain'],
  ['https://www.twitch.tv/someone', 'Stream', 'Entertainment', 'domain'],
  ['https://open.spotify.com/playlist/1', 'Playlist', 'Entertainment', 'domain'],
  ['https://store.steampowered.com/app/1', 'Game', 'Entertainment', 'domain'],
  ['https://www.imdb.com/title/tt1', 'Film', 'Entertainment', 'domain'],
  ['https://www.amazon.com/dp/B01', 'Keyboard', 'Shopping', 'domain'],
  ['https://www.amazon.co.uk/dp/B01', 'Keyboard', 'Shopping', 'domain'],
  ['https://www.amazon.de/dp/B01', 'Tastatur', 'Shopping', 'domain'],
  ['https://www.ebay.co.uk/itm/1', 'Item', 'Shopping', 'domain'],
  ['https://www.etsy.com/listing/1/mug', 'Mug', 'Shopping', 'domain'],
  ['https://www.ikea.com/gb/en/p/1', 'Shelf', 'Shopping', 'domain'],
  ['https://www.chase.com/personal', 'Account Summary', 'Finance', 'domain'],
  ['https://www.paypal.com/myaccount', 'PayPal', 'Finance', 'domain'],
  ['https://stripe.com/docs/api', 'Stripe API', 'Finance', 'domain'],
  ['https://www.coinbase.com/price/btc', 'BTC', 'Finance', 'domain'],
  ['https://x.com/user/status/1', 'user on X', 'Social', 'domain'],
  ['https://twitter.com/user', 'user', 'Social', 'domain'],
  ['https://www.linkedin.com/feed/', 'Feed', 'Social', 'domain'],
  ['https://www.instagram.com/p/1', 'Photo', 'Social', 'domain'],
  ['https://discord.com/channels/1/2', 'Discord', 'Social', 'domain'],
  ['https://www.nytimes.com/2026/07/02/tech/a.html', 'Story', 'News', 'domain'],
  ['https://www.theverge.com/2026/7/1/1/x', 'Verge story', 'News', 'domain'],
  ['https://news.ycombinator.com/item?id=1', 'Show HN', 'News', 'domain'],
  ['https://www.bbc.co.uk/news/uk-1', 'BBC', 'News', 'domain'],
  ['https://chat.openai.com/c/abc', 'Debugging', 'AI', 'domain'],
  ['https://claude.ai/chat/abc', 'Tab debt scoring', 'AI', 'domain'],
  ['https://huggingface.co/models/x', 'Model', 'AI', 'domain'],
  ['https://gemini.google.com/app', 'Gemini', 'AI', 'domain'],
  ['https://www.airbnb.com/rooms/1', 'Loft', 'Travel', 'domain'],
  ['https://www.airbnb.co.uk/rooms/1', 'Loft', 'Travel', 'domain'],
  ['https://www.booking.com/hotel/pt/x.html', 'Hotel', 'Travel', 'domain'],
  ['https://www.kayak.com/flights', 'Flights', 'Travel', 'domain'],
  ['https://getpocket.com/saves', 'My List', 'Reading Later', 'domain'],
  ['https://someone.substack.com/p/post', 'Post', 'Reading Later', 'domain'],

  // --- Tier 3: multi-purpose path/title heuristics --------------------------------------
  ['https://www.youtube.com/watch?v=1', 'Build a Chrome Extension — Full Tutorial', 'Learning', 'path'],
  ['https://www.youtube.com/watch?v=2', 'Rust Ownership Explained (Complete Course)', 'Learning', 'path'],
  ['https://www.youtube.com/watch?v=3', 'How to Debug Memory Leaks — Deep Dive Guide', 'Learning', 'path'],
  ['https://www.youtube.com/watch?v=4', 'Official Music Video - router', 'Entertainment', 'path'],
  ['https://www.youtube.com/watch?v=5', 'lofi hip hop radio - beats to relax to', 'Entertainment', 'path'],
  ['https://www.youtube.com/watch?v=6', 'some vlog', 'Entertainment', 'path'],
  ['https://www.reddit.com/r/programming/comments/a/b', 'Why is my bundle 4MB?', 'Development', 'path'],
  ['https://www.reddit.com/r/webdev/comments/a/b', 'Ask r/webdev', 'Development', 'path'],
  ['https://www.reddit.com/r/memes/comments/a/b', 'when the tests pass', 'Entertainment', 'path'],
  ['https://www.reddit.com/r/worldnews/comments/a/b', 'Headline', 'News', 'path'],
  ['https://www.reddit.com/r/personalfinance/comments/a/b', 'Budgeting', 'Finance', 'path'],
  ['https://www.reddit.com/r/solotravel/comments/a/b', 'Lisbon', 'Travel', 'path'],
  ['https://www.reddit.com/r/cooking/comments/a/b', 'Risotto', 'Social', 'path'],
  ['https://medium.com/@u/why-your-bundle-is-too-big-abc', 'Why your JavaScript bundle is too big', 'Development', 'path'],
  ['https://medium.com/@u/on-gardening-abc', 'On gardening', 'Reading Later', 'path'],
  ['https://www.google.com/travel/flights', 'Flights', 'Travel', 'domain'],
  ['https://www.google.com/search?q=x', 'x - Google Search', 'Other', 'path'],
  ['https://news.google.com/topics/1', 'Top stories', 'News', 'path'],

  // --- Tier 4: title keyword scoring ----------------------------------------------------
  ['https://unknown-site.example/x', 'Advanced TypeScript patterns', 'Development', 'keyword'],
  ['https://unknown-site.example/y', 'Free Python course for beginners', 'Learning', 'keyword'],
  ['https://shop.example/z', 'Your shopping cart', 'Shopping', 'keyword'],
  ['https://bill.example/z', 'Invoice #4021', 'Finance', 'keyword'],
  ['https://trip.example/z', 'Cheap flight to Lisbon', 'Travel', 'keyword'],
  ['https://co.example/z', 'Team meeting notes', 'Work', 'keyword'],

  // --- Tier 5: fallback -----------------------------------------------------------------
  ['https://random-unknown.example/page', 'Some page', 'Other', 'fallback'],
  ['about:blank', 'about:blank', 'Other', 'fallback'],
  ['chrome://extensions/', 'Extensions', 'Other', 'fallback'],
  ['chrome://settings/', 'Settings', 'Other', 'fallback'],
  ['not a url at all', 'Broken', 'Other', 'fallback'],
  ['', '', 'Other', 'fallback'],
];

describe('classify — rule table', () => {
  it(`covers at least 60 cases (has ${TABLE.length})`, () => {
    expect(TABLE.length).toBeGreaterThanOrEqual(60);
  });

  it.each(TABLE)('%s / %s -> %s via %s', (url, title, category, tier) => {
    const result = classify({ url, title });
    expect({ category: result.category, tier: result.tier }).toEqual({ category, tier });
  });

  it('exercises every rule tier at least once', () => {
    const tiers = new Set(TABLE.map((r) => r[3]));
    expect([...tiers].sort()).toEqual(['domain', 'fallback', 'keyword', 'path']);
    // Tier 1 is asserted separately below since it needs an overrides map.
  });
});

describe('classify — overrides (tier 1)', () => {
  it('beats every other tier, permanently', () => {
    const r = classify(
      { url: 'https://github.com/a/b', title: 'PR' },
      { 'github.com': 'Entertainment' },
    );
    expect(r.category).toBe('Entertainment');
    expect(r.tier).toBe('override');
    expect(r.reason).toContain('github.com');
  });

  it('is keyed on the bare domain, so www. and subpaths still match', () => {
    const r = classify({ url: 'https://www.nytimes.com/2026/x.html', title: 'Story' }, { 'nytimes.com': 'Work' });
    expect(r.category).toBe('Work');
  });

  it('does not leak to unrelated domains', () => {
    const r = classify({ url: 'https://theverge.com/x', title: 'Story' }, { 'nytimes.com': 'Work' });
    expect(r.category).toBe('News');
  });
});

describe('classify — properties', () => {
  it('is a pure function: identical input gives identical output', () => {
    const input = { url: 'https://www.youtube.com/watch?v=1', title: 'Rust Tutorial' };
    expect(classify(input)).toEqual(classify(input));
  });

  it('always explains which rule fired', () => {
    for (const [url, title] of TABLE) {
      const r = classify({ url, title });
      expect(r.reason.length, `${url} had an empty reason`).toBeGreaterThan(0);
    }
  });

  it('never throws on hostile input', () => {
    const nasty = ['', ' ', 'http://', 'javascript:alert(1)', 'data:text/html,x', 'x'.repeat(5000)];
    for (const url of nasty) expect(() => classify({ url, title: '☃' })).not.toThrow();
  });

  it('classifyAll memoises without changing results', () => {
    const tabs = TABLE.slice(0, 20).map(([url, title]) => ({ url, title }));
    const bulk = classifyAll(tabs);
    for (const tab of tabs) expect(bulk.get(tab)).toEqual(classify(tab));
  });
});

describe('classify — fixture coverage gate', () => {
  it('lands at least 85% of a 400-tab fixture in a non-Other category', () => {
    const fixture = generateFixture(400);
    const results = fixture.tabs.map((t) => classify({ url: t.url, title: t.title }));
    const nonOther = results.filter((r) => r.category !== 'Other').length;
    const pct = (nonOther / results.length) * 100;
    expect(pct, `only ${pct.toFixed(1)}% categorised`).toBeGreaterThanOrEqual(85);
  });
});
