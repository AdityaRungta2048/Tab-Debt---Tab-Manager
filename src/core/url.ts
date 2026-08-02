/**
 * URL handling shared by categorisation and duplicate detection. Pure, and deliberately
 * tolerant: `about:blank`, `chrome://`, and outright malformed URLs all appear in a real
 * 400-tab set, and none of them may throw.
 */

export type ParsedUrl = {
  ok: boolean;
  scheme: string;
  /** Host with `www.` stripped and port removed, lowercased. Empty for non-http schemes. */
  domain: string;
  /** Host including port, as given. */
  host: string;
  path: string;
  search: string;
  hash: string;
};

const EMPTY: ParsedUrl = {
  ok: false,
  scheme: '',
  domain: '',
  host: '',
  path: '',
  search: '',
  hash: '',
};

export function parseUrl(raw: string): ParsedUrl {
  if (!raw) return EMPTY;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return EMPTY;
  }
  const scheme = u.protocol.replace(':', '');
  // Internal pages have no meaningful domain; treating `chrome://settings` as domain
  // "settings" would put it in a domain pileup suggestion, which is nonsense.
  const isWeb = scheme === 'http' || scheme === 'https';
  const domain = isWeb ? u.hostname.toLowerCase().replace(/^www\./, '') : '';
  return {
    ok: true,
    scheme,
    domain,
    host: u.host.toLowerCase(),
    path: u.pathname,
    search: u.search,
    hash: u.hash,
  };
}

/**
 * Matches a domain against a rule pattern. Supported forms:
 *   `example.com`    exact
 *   `*.example.com`  any subdomain (and the bare domain itself)
 *   `amazon.*`       any TLD, including multi-part ones like `.co.uk`
 *   `example.com/x`  domain plus a path prefix
 */
export function domainMatches(parsed: ParsedUrl, pattern: string): boolean {
  const slash = pattern.indexOf('/');
  if (slash !== -1) {
    const domainPart = pattern.slice(0, slash);
    const pathPart = pattern.slice(slash);
    return domainMatches(parsed, domainPart) && parsed.path.startsWith(pathPart);
  }

  // Only http(s) URLs have a domain worth matching. `chrome://settings/` parses with host
  // "settings", so falling back to `host` here would match it against real domain rules.
  const domain = parsed.domain;
  if (!domain) return false;

  if (pattern.startsWith('*.')) {
    const base = pattern.slice(2);
    return domain === base || domain.endsWith(`.${base}`);
  }
  if (pattern.endsWith('.*')) {
    const base = pattern.slice(0, -2);
    return domain === base || domain.startsWith(`${base}.`);
  }
  // An exact rule also covers `www.`-style subdomains of itself, so `notion.so` catches
  // `www.notion.so`, but never matches an unrelated domain that merely ends the same way.
  return domain === pattern || domain.endsWith(`.${pattern}`);
}

/** djb2. Used to key activity records by URL so reused tab ids cannot collide. */
export function hashString(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
