import type { Category } from '@/types/tab';

/**
 * THE RULE TABLE. This is data, not code, and it is meant to be edited by someone who has
 * never read the classifier. If you want a domain categorised differently, change a line
 * here — you should never need to touch classify.ts.
 *
 * Priority (see classify.ts):
 *   1. user overrides   2. DOMAIN_RULES   3. MULTI_PURPOSE   4. KEYWORD_RULES   5. Other
 *
 * Because DOMAIN_RULES outranks MULTI_PURPOSE, a domain that means different things on
 * different paths (youtube, reddit, medium) must live ONLY in MULTI_PURPOSE. Putting it in
 * both makes the path rules dead code.
 */

/** Patterns support `example.com`, `*.example.com` (subdomains), and `amazon.*` (any TLD). */
export type DomainRule = { pattern: string; category: Category; note: string };

export const DOMAIN_RULES: DomainRule[] = [
  // --- Development -------------------------------------------------------------------
  { pattern: 'github.com', category: 'Development', note: 'Source hosting' },
  { pattern: 'gitlab.com', category: 'Development', note: 'Source hosting' },
  { pattern: 'bitbucket.org', category: 'Development', note: 'Source hosting' },
  { pattern: 'stackoverflow.com', category: 'Development', note: 'Programming Q&A' },
  { pattern: '*.stackexchange.com', category: 'Development', note: 'Programming Q&A' },
  { pattern: 'developer.mozilla.org', category: 'Development', note: 'Web platform docs' },
  { pattern: 'npmjs.com', category: 'Development', note: 'Package registry' },
  { pattern: 'localhost', category: 'Development', note: 'Local dev server' },
  { pattern: '127.0.0.1', category: 'Development', note: 'Local dev server' },
  { pattern: 'codepen.io', category: 'Development', note: 'Code sandbox' },
  { pattern: 'codesandbox.io', category: 'Development', note: 'Code sandbox' },
  { pattern: 'stackblitz.com', category: 'Development', note: 'Code sandbox' },
  { pattern: 'vercel.com', category: 'Development', note: 'Deploy platform' },
  { pattern: 'netlify.com', category: 'Development', note: 'Deploy platform' },
  { pattern: 'developer.chrome.com', category: 'Development', note: 'Platform docs' },
  { pattern: 'caniuse.com', category: 'Development', note: 'Platform support tables' },
  { pattern: 'regex101.com', category: 'Development', note: 'Developer tool' },

  // --- Work ---------------------------------------------------------------------------
  { pattern: 'docs.google.com', category: 'Work', note: 'Documents and spreadsheets' },
  { pattern: 'drive.google.com', category: 'Work', note: 'File storage' },
  { pattern: 'mail.google.com', category: 'Work', note: 'Email' },
  { pattern: 'calendar.google.com', category: 'Work', note: 'Calendar' },
  { pattern: 'notion.so', category: 'Work', note: 'Team wiki' },
  { pattern: 'figma.com', category: 'Work', note: 'Design tool' },
  { pattern: 'linear.app', category: 'Work', note: 'Issue tracker' },
  { pattern: 'atlassian.net', category: 'Work', note: 'Issue tracker' },
  { pattern: 'jira.com', category: 'Work', note: 'Issue tracker' },
  { pattern: 'slack.com', category: 'Work', note: 'Team chat' },
  { pattern: 'zoom.us', category: 'Work', note: 'Meetings' },
  { pattern: 'meet.google.com', category: 'Work', note: 'Meetings' },
  { pattern: 'asana.com', category: 'Work', note: 'Project management' },
  { pattern: 'trello.com', category: 'Work', note: 'Project management' },
  { pattern: 'airtable.com', category: 'Work', note: 'Structured data' },
  { pattern: 'dropbox.com', category: 'Work', note: 'File storage' },

  // --- Learning -----------------------------------------------------------------------
  { pattern: 'coursera.org', category: 'Learning', note: 'Course platform' },
  { pattern: 'udemy.com', category: 'Learning', note: 'Course platform' },
  { pattern: 'edx.org', category: 'Learning', note: 'Course platform' },
  { pattern: 'khanacademy.org', category: 'Learning', note: 'Course platform' },
  { pattern: 'duolingo.com', category: 'Learning', note: 'Language learning' },
  { pattern: 'wikipedia.org', category: 'Learning', note: 'Reference' },
  { pattern: '*.wikipedia.org', category: 'Learning', note: 'Reference' },
  { pattern: 'arxiv.org', category: 'Learning', note: 'Research papers' },
  { pattern: 'scholar.google.com', category: 'Learning', note: 'Research papers' },

  // --- Entertainment ------------------------------------------------------------------
  { pattern: 'netflix.com', category: 'Entertainment', note: 'Streaming video' },
  { pattern: 'twitch.tv', category: 'Entertainment', note: 'Live streaming' },
  { pattern: 'spotify.com', category: 'Entertainment', note: 'Music' },
  { pattern: 'open.spotify.com', category: 'Entertainment', note: 'Music' },
  { pattern: 'soundcloud.com', category: 'Entertainment', note: 'Music' },
  { pattern: 'hulu.com', category: 'Entertainment', note: 'Streaming video' },
  { pattern: 'disneyplus.com', category: 'Entertainment', note: 'Streaming video' },
  { pattern: 'steampowered.com', category: 'Entertainment', note: 'Games' },
  { pattern: 'imdb.com', category: 'Entertainment', note: 'Film and TV reference' },

  // --- Shopping -----------------------------------------------------------------------
  { pattern: 'amazon.*', category: 'Shopping', note: 'Retail, any regional TLD' },
  { pattern: 'ebay.*', category: 'Shopping', note: 'Retail, any regional TLD' },
  { pattern: 'etsy.com', category: 'Shopping', note: 'Retail' },
  { pattern: 'aliexpress.com', category: 'Shopping', note: 'Retail' },
  { pattern: 'walmart.com', category: 'Shopping', note: 'Retail' },
  { pattern: 'target.com', category: 'Shopping', note: 'Retail' },
  { pattern: 'ikea.com', category: 'Shopping', note: 'Retail' },
  { pattern: 'bestbuy.com', category: 'Shopping', note: 'Retail' },

  // --- Finance ------------------------------------------------------------------------
  { pattern: 'chase.com', category: 'Finance', note: 'Banking' },
  { pattern: 'bankofamerica.com', category: 'Finance', note: 'Banking' },
  { pattern: 'wellsfargo.com', category: 'Finance', note: 'Banking' },
  { pattern: 'paypal.com', category: 'Finance', note: 'Payments' },
  { pattern: 'stripe.com', category: 'Finance', note: 'Payments' },
  { pattern: 'wise.com', category: 'Finance', note: 'Payments' },
  { pattern: 'coinbase.com', category: 'Finance', note: 'Exchange' },
  { pattern: 'robinhood.com', category: 'Finance', note: 'Brokerage' },
  { pattern: 'fidelity.com', category: 'Finance', note: 'Brokerage' },
  { pattern: 'mint.com', category: 'Finance', note: 'Personal finance' },

  // --- Social -------------------------------------------------------------------------
  { pattern: 'x.com', category: 'Social', note: 'Social network' },
  { pattern: 'twitter.com', category: 'Social', note: 'Social network' },
  { pattern: 'facebook.com', category: 'Social', note: 'Social network' },
  { pattern: 'instagram.com', category: 'Social', note: 'Social network' },
  { pattern: 'linkedin.com', category: 'Social', note: 'Professional network' },
  { pattern: 'bsky.app', category: 'Social', note: 'Social network' },
  { pattern: 'mastodon.social', category: 'Social', note: 'Social network' },
  { pattern: 'discord.com', category: 'Social', note: 'Chat' },
  { pattern: 'tiktok.com', category: 'Social', note: 'Short video' },

  // --- News ---------------------------------------------------------------------------
  { pattern: 'nytimes.com', category: 'News', note: 'News' },
  { pattern: 'theguardian.com', category: 'News', note: 'News' },
  { pattern: 'bbc.com', category: 'News', note: 'News' },
  { pattern: 'bbc.co.uk', category: 'News', note: 'News' },
  { pattern: 'theverge.com', category: 'News', note: 'Technology news' },
  { pattern: 'arstechnica.com', category: 'News', note: 'Technology news' },
  { pattern: 'techcrunch.com', category: 'News', note: 'Technology news' },
  { pattern: 'wsj.com', category: 'News', note: 'News' },
  { pattern: 'ft.com', category: 'News', note: 'News' },
  { pattern: 'reuters.com', category: 'News', note: 'News' },
  { pattern: 'news.ycombinator.com', category: 'News', note: 'Aggregator' },

  // --- AI ---------------------------------------------------------------------------
  { pattern: 'chat.openai.com', category: 'AI', note: 'Assistant' },
  { pattern: 'chatgpt.com', category: 'AI', note: 'Assistant' },
  { pattern: 'claude.ai', category: 'AI', note: 'Assistant' },
  { pattern: 'gemini.google.com', category: 'AI', note: 'Assistant' },
  { pattern: 'perplexity.ai', category: 'AI', note: 'Assistant' },
  { pattern: 'huggingface.co', category: 'AI', note: 'Model hub' },
  { pattern: 'midjourney.com', category: 'AI', note: 'Image generation' },
  { pattern: 'platform.openai.com', category: 'AI', note: 'Developer console' },

  // --- Travel -------------------------------------------------------------------------
  { pattern: 'airbnb.*', category: 'Travel', note: 'Lodging, any regional TLD' },
  { pattern: 'booking.com', category: 'Travel', note: 'Lodging' },
  { pattern: 'expedia.com', category: 'Travel', note: 'Travel booking' },
  { pattern: 'kayak.com', category: 'Travel', note: 'Flight search' },
  { pattern: 'skyscanner.net', category: 'Travel', note: 'Flight search' },
  { pattern: 'tripadvisor.com', category: 'Travel', note: 'Reviews' },
  { pattern: 'google.com/travel', category: 'Travel', note: 'Travel search' },

  // --- Reading Later ------------------------------------------------------------------
  { pattern: 'getpocket.com', category: 'Reading Later', note: 'Read-it-later service' },
  { pattern: 'instapaper.com', category: 'Reading Later', note: 'Read-it-later service' },
  { pattern: 'readwise.io', category: 'Reading Later', note: 'Read-it-later service' },
  { pattern: 'substack.com', category: 'Reading Later', note: 'Long-form newsletters' },
  { pattern: '*.substack.com', category: 'Reading Later', note: 'Long-form newsletters' },
];

/**
 * Domains that mean different things on different paths. `fallback` applies when no rule
 * in the list matches, so these domains never silently drop through to keyword scoring.
 */
export type PathRule = {
  /** Matched against `pathname + search + hash`. */
  match?: string;
  /** Matched against the tab title, case-insensitively. */
  titleMatch?: string;
  category: Category;
  note: string;
};

export type MultiPurposeRule = {
  pattern: string;
  fallback: Category;
  fallbackNote: string;
  rules: PathRule[];
};

export const MULTI_PURPOSE: MultiPurposeRule[] = [
  {
    pattern: 'youtube.com',
    fallback: 'Entertainment',
    fallbackNote: 'YouTube, no learning signal in the title',
    rules: [
      {
        titleMatch: '\\b(tutorial|course|lecture|explained|how to|deep dive|crash course|guide|walkthrough|masterclass)\\b',
        category: 'Learning',
        note: 'YouTube video whose title reads instructional',
      },
      {
        titleMatch: '\\b(official (music )?video|lyrics|full album|live at|remix|lofi|radio)\\b',
        category: 'Entertainment',
        note: 'YouTube music video',
      },
    ],
  },
  {
    pattern: 'reddit.com',
    fallback: 'Social',
    fallbackNote: 'Reddit, no subreddit signal',
    rules: [
      { match: '^/r/(programming|webdev|rust|golang|javascript|typescript|python|devops|reactjs|node)\\b', category: 'Development', note: 'Programming subreddit' },
      { match: '^/r/(memes|funny|aww|gaming|movies|pics|videos)\\b', category: 'Entertainment', note: 'Entertainment subreddit' },
      { match: '^/r/(news|worldnews|politics|technology)\\b', category: 'News', note: 'News subreddit' },
      { match: '^/r/(personalfinance|investing|wallstreetbets|stocks)\\b', category: 'Finance', note: 'Finance subreddit' },
      { match: '^/r/(travel|solotravel|backpacking)\\b', category: 'Travel', note: 'Travel subreddit' },
    ],
  },
  {
    pattern: 'medium.com',
    fallback: 'Reading Later',
    fallbackNote: 'Medium long-form article',
    rules: [
      { titleMatch: '\\b(javascript|typescript|react|python|rust|kubernetes|docker|api|code)\\b', category: 'Development', note: 'Medium article on a programming topic' },
    ],
  },
  {
    pattern: 'google.com',
    fallback: 'Other',
    fallbackNote: 'Google, no specific product path',
    rules: [
      { match: '^/travel', category: 'Travel', note: 'Google Travel' },
      { match: '^/finance', category: 'Finance', note: 'Google Finance' },
      { match: '^/search', category: 'Other', note: 'Search results page' },
    ],
  },
  {
    pattern: 'news.google.com',
    fallback: 'News',
    fallbackNote: 'Google News',
    rules: [],
  },
];

/**
 * Title keyword scoring — the last resort before Other. Weights are summed per category
 * and the highest total wins, so "React tutorial pricing" leans Development, not Shopping.
 */
export type KeywordRule = { keyword: string; category: Category; weight: number };

export const KEYWORD_RULES: KeywordRule[] = [
  { keyword: 'pull request', category: 'Development', weight: 3 },
  { keyword: 'commit', category: 'Development', weight: 2 },
  { keyword: 'api', category: 'Development', weight: 2 },
  { keyword: 'documentation', category: 'Development', weight: 2 },
  { keyword: 'docs', category: 'Development', weight: 1 },
  { keyword: 'npm', category: 'Development', weight: 2 },
  { keyword: 'typescript', category: 'Development', weight: 2 },
  { keyword: 'javascript', category: 'Development', weight: 2 },
  { keyword: 'python', category: 'Development', weight: 2 },
  { keyword: 'debug', category: 'Development', weight: 2 },
  { keyword: 'tutorial', category: 'Learning', weight: 3 },
  { keyword: 'course', category: 'Learning', weight: 3 },
  { keyword: 'lecture', category: 'Learning', weight: 3 },
  { keyword: 'learn', category: 'Learning', weight: 2 },
  { keyword: 'introduction to', category: 'Learning', weight: 2 },
  { keyword: 'cart', category: 'Shopping', weight: 3 },
  { keyword: 'checkout', category: 'Shopping', weight: 3 },
  { keyword: 'buy', category: 'Shopping', weight: 2 },
  { keyword: 'price', category: 'Shopping', weight: 1 },
  { keyword: 'invoice', category: 'Finance', weight: 3 },
  { keyword: 'billing', category: 'Finance', weight: 2 },
  { keyword: 'tax', category: 'Finance', weight: 2 },
  { keyword: 'flight', category: 'Travel', weight: 3 },
  { keyword: 'hotel', category: 'Travel', weight: 3 },
  { keyword: 'itinerary', category: 'Travel', weight: 3 },
  { keyword: 'inbox', category: 'Work', weight: 2 },
  { keyword: 'meeting', category: 'Work', weight: 2 },
  { keyword: 'roadmap', category: 'Work', weight: 2 },
  { keyword: 'weather', category: 'Other', weight: 1 },
];

/** Origins where a tab plausibly holds unsaved work. Never auto-selected for closing. */
export const EDITOR_ORIGINS = [
  'docs.google.com',
  'sheets.google.com',
  'figma.com',
  'notion.so',
  'linear.app',
  'overleaf.com',
  'canva.com',
  'codesandbox.io',
  'stackblitz.com',
  'mail.google.com',
];
