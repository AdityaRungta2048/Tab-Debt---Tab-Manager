/**
 * The raw material the fixture generator draws from. Kept separate from the generator so
 * the "what a realistic tab set looks like" judgement is reviewable on its own.
 */

export type CatalogEntry = {
  domain: string;
  paths: string[];
  titles: string[];
  /** Relative frequency. GitHub tabs pile up; bank tabs do not. */
  weight: number;
};

export const CATALOG: CatalogEntry[] = [
  {
    domain: 'github.com',
    weight: 14,
    paths: ['/facebook/react/pull/{n}', '/vitejs/vite/issues/{n}', '/{u}/{r}', '/{u}/{r}/blob/main/src/index.ts'],
    titles: ['Fix flaky test in scheduler by {u} · Pull Request #{n}', '{r}: memory leak on unmount · Issue #{n}', 'GitHub - {u}/{r}: A tiny {r} library'],
  },
  {
    domain: 'stackoverflow.com',
    weight: 8,
    paths: ['/questions/{n}/how-to-{r}', '/questions/{n}'],
    titles: ['typescript - How to narrow a union inside a generic - Stack Overflow', 'css - Why does flexbox overflow its container - Stack Overflow'],
  },
  {
    domain: 'developer.mozilla.org',
    weight: 5,
    paths: ['/en-US/docs/Web/API/{r}', '/en-US/docs/Web/CSS/{r}'],
    titles: ['IntersectionObserver - Web APIs | MDN', 'grid-template-areas - CSS | MDN'],
  },
  {
    domain: 'localhost',
    weight: 3,
    paths: ['/', '/dashboard', '/api/health'],
    titles: ['Vite + Preact', 'Dashboard'],
  },
  {
    domain: 'docs.google.com',
    weight: 7,
    paths: ['/document/d/{h}/edit', '/spreadsheets/d/{h}/edit'],
    titles: ['Q3 Planning - Google Docs', 'Draft: Postmortem 2026-04 - Google Docs', 'Headcount model - Google Sheets'],
  },
  {
    domain: 'mail.google.com',
    weight: 3,
    paths: ['/mail/u/0/#inbox', '/mail/u/0/#inbox/{h}'],
    titles: ['Inbox (2,481) - work@example.com - Gmail'],
  },
  {
    domain: 'notion.so',
    weight: 6,
    paths: ['/workspace/{h}', '/{r}-{h}'],
    titles: ['Engineering Handbook', 'Draft: RFC — tab debt scoring'],
  },
  {
    domain: 'figma.com',
    weight: 4,
    paths: ['/file/{h}/{r}', '/design/{h}/{r}'],
    titles: ['Design System – Figma', 'Onboarding v3 – Figma'],
  },
  {
    domain: 'linear.app',
    weight: 4,
    paths: ['/team/ENG/issue/ENG-{n}'],
    titles: ['ENG-{n} Popup takes 400ms to open', 'ENG-{n} Undo loses group membership'],
  },
  {
    domain: 'youtube.com',
    weight: 12,
    paths: ['/watch?v={h}', '/playlist?list={h}'],
    titles: [
      'Build a Chrome Extension in 2026 — Full Tutorial',
      'Rust Ownership Explained (Complete Course)',
      'lofi hip hop radio - beats to relax/study to',
      'Official Music Video - {r}',
      'How to Debug Memory Leaks — Deep Dive Guide',
    ],
  },
  {
    domain: 'reddit.com',
    weight: 8,
    paths: ['/r/programming/comments/{h}/{r}', '/r/memes/comments/{h}/{r}', '/r/webdev/comments/{h}/{r}'],
    titles: ['Why is my bundle 4MB? : programming', 'when the tests pass first try : memes', 'Ask r/webdev: best tab manager?'],
  },
  {
    domain: 'news.ycombinator.com',
    weight: 5,
    paths: ['/item?id={n}', '/'],
    titles: ['Show HN: I built a tab manager | Hacker News', 'Hacker News'],
  },
  {
    domain: 'amazon.com',
    weight: 6,
    paths: ['/dp/{h}', '/gp/cart/view.html', '/s?k={r}'],
    titles: ['Amazon.com: Mechanical Keyboard 65% Hot-swappable', 'Amazon.com Shopping Cart'],
  },
  {
    domain: 'etsy.com',
    weight: 2,
    paths: ['/listing/{n}/{r}'],
    titles: ['Handmade Ceramic Mug - Etsy'],
  },
  {
    domain: 'chase.com',
    weight: 1,
    paths: ['/personal/credit-cards', '/'],
    titles: ['Chase Online - Account Summary'],
  },
  {
    domain: 'stripe.com',
    weight: 2,
    paths: ['/docs/api/{r}', '/dashboard/payments'],
    titles: ['Stripe API Reference — Charges', 'Payments — Stripe Dashboard'],
  },
  {
    domain: 'x.com',
    weight: 6,
    paths: ['/{u}/status/{n}', '/home'],
    titles: ['{u} on X: "the tab situation is out of control"', 'Home / X'],
  },
  {
    domain: 'linkedin.com',
    weight: 3,
    paths: ['/in/{u}', '/feed/'],
    titles: ['{u} | LinkedIn', 'Feed | LinkedIn'],
  },
  {
    domain: 'nytimes.com',
    weight: 4,
    paths: ['/2026/07/{n}/technology/{r}.html'],
    titles: ['The Quiet Cost of 400 Open Tabs - The New York Times'],
  },
  {
    domain: 'theverge.com',
    weight: 3,
    paths: ['/2026/7/{n}/{n}/{r}'],
    titles: ['Chrome is testing a new tab grouping feature - The Verge'],
  },
  {
    domain: 'chat.openai.com',
    weight: 5,
    paths: ['/c/{h}'],
    titles: ['Debugging a service worker', 'Regex for tracking params'],
  },
  {
    domain: 'claude.ai',
    weight: 4,
    paths: ['/chat/{h}'],
    titles: ['Tab debt scoring model', 'Reviewing my extension manifest'],
  },
  {
    domain: 'huggingface.co',
    weight: 2,
    paths: ['/models/{r}', '/datasets/{r}'],
    titles: ['{r} · Hugging Face'],
  },
  {
    domain: 'coursera.org',
    weight: 3,
    paths: ['/learn/{r}', '/learn/{r}/lecture/{h}'],
    titles: ['Machine Learning Course | Coursera'],
  },
  {
    domain: 'airbnb.com',
    weight: 3,
    paths: ['/rooms/{n}', '/s/Lisbon/homes'],
    titles: ['Loft in Lisbon · Airbnb', 'Lisbon Homes - Airbnb'],
  },
  {
    domain: 'booking.com',
    weight: 2,
    paths: ['/hotel/pt/{r}.html'],
    titles: ['Hotel Alfama, Lisbon — Booking.com'],
  },
  {
    domain: 'getpocket.com',
    weight: 2,
    paths: ['/read/{n}', '/saves'],
    titles: ['Pocket - My List'],
  },
  {
    domain: 'medium.com',
    weight: 4,
    paths: ['/@{u}/{r}-{h}'],
    titles: ['Why your bundle is too big | by {u} | Medium'],
  },
];

/** Non-Latin and otherwise awkward titles, mixed in so layout is tested against reality. */
export const AWKWARD_TITLES = [
  '東京の天気 - Yahoo!天気',
  'Как настроить Nginx — Хабр',
  'مقدمة في البرمجة',
  '‏‎',
  'A'.repeat(180),
  'Untitled',
  'Untitled',
];

export const USERS = ['dan', 'sindresorhus', 'kentcdodds', 'rich-harris', 'antfu', 'sarah'];
export const SLUGS = ['router', 'signals', 'parser', 'hooks', 'runtime', 'compiler', 'cache'];
