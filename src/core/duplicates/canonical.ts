import { parseUrl } from '../url';

/**
 * Tracking parameters stripped when computing the canonical form. Editable in Settings,
 * because this list is never finished. Prefixed entries end with `*`.
 */
export const DEFAULT_TRACKING_PARAMS = [
  'utm_*',
  'fbclid',
  'gclid',
  'dclid',
  'gbraid',
  'wbraid',
  'msclkid',
  'twclid',
  'igshid',
  'mc_cid',
  'mc_eid',
  'ref',
  'ref_src',
  'ref_url',
  'referrer',
  'source',
  'campaign',
  'campaign_id',
  'ck_subscriber_id',
  'yclid',
  '_hsenc',
  '_hsmi',
  'vero_id',
  'oly_enc_id',
  'oly_anon_id',
  '__s',
  'spm',
  'scid',
  'trk',
  'trkCampaign',
  'sc_campaign',
  'sc_channel',
];

function isTracking(name: string, patterns: string[]): boolean {
  const lower = name.toLowerCase();
  return patterns.some((p) => {
    const pl = p.toLowerCase();
    return pl.endsWith('*') ? lower.startsWith(pl.slice(0, -1)) : lower === pl;
  });
}

/**
 * Is this fragment a ROUTE (meaningful, must be preserved) or a plain anchor into a
 * document (noise, safe to strip)?
 *
 * The asymmetry matters: wrongly stripping a route collapses two genuinely different
 * pages and the user loses a tab, while wrongly keeping an anchor merely means a
 * duplicate goes unreported. So this errs toward keeping.
 *
 *   https://app.example.com/#/inbox      path is "/"      -> route, keep
 *   https://mail.google.com/u/0/#inbox/x contains "/"     -> route, keep
 *   https://example.com/a#!/x            shebang route    -> route, keep
 *   https://mdn.org/docs/fetch#syntax    plain anchor     -> strip
 */
export function isRouteFragment(path: string, hash: string): boolean {
  if (!hash || hash === '#') return false;
  const body = hash.slice(1);
  if (path === '' || path === '/') return true;
  if (body.startsWith('!')) return true;
  return body.includes('/');
}

export type CanonicalOptions = { trackingParams?: string[] };

/**
 * Canonical form: origin + normalised path + surviving query (sorted) + route fragment.
 * Pure, total, and never throws — `about:blank` and malformed URLs pass through as-is so
 * they can still be compared for exact equality.
 */
export function canonicalize(raw: string, opts: CanonicalOptions = {}): string {
  const patterns = opts.trackingParams ?? DEFAULT_TRACKING_PARAMS;
  const parsed = parseUrl(raw);
  if (!parsed.ok || !parsed.domain) return raw.trim();

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return raw.trim();
  }

  // `new URL` already drops default ports (:443 on https, :80 on http).
  const origin = `${url.protocol}//${parsed.domain}${url.port ? `:${url.port}` : ''}`;

  // Trailing slashes are never semantic for comparison purposes.
  const path = url.pathname.replace(/\/+$/, '');

  const params = [...url.searchParams.entries()]
    .filter(([k]) => !isTracking(k, patterns))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const search = params.length ? `?${params.map(([k, v]) => `${k}=${v}`).join('&')}` : '';

  const hash = isRouteFragment(url.pathname, url.hash) ? url.hash : '';

  return `${origin}${path}${search}${hash}`;
}

/** Origin + path only. Two tabs sharing this differ solely by query — the same-page tier. */
export function samePageKey(raw: string): string {
  const parsed = parseUrl(raw);
  if (!parsed.ok || !parsed.domain) return raw.trim();
  try {
    const url = new URL(raw);
    const hash = isRouteFragment(url.pathname, url.hash) ? url.hash : '';
    return `${url.protocol}//${parsed.domain}${url.pathname.replace(/\/+$/, '')}${hash}`;
  } catch {
    return raw.trim();
  }
}
