import type { Category, TabSnapshot } from '@/types/tab';

/**
 * Instant fuzzy search over title, URL, domain and category.
 *
 * The budget is 16ms per keystroke at 800 tabs, so: the index is built once and reused,
 * and a query that extends the previous one filters the previous RESULTS rather than the
 * whole set — which is the common case while typing, and turns an 800-item scan into a
 * scan of whatever is still on screen.
 */

export type SearchEntry = {
  id: number;
  /** Lowercased "title url domain category", built once. Substring matching only. */
  haystack: string;
  title: string;
  domain: string;
  /** Title + domain. Fuzzy subsequence matching runs against THIS, never the haystack:
   *  a subsequence over a 200-character blob that includes the full URL matches nearly
   *  everything, so "lisbon" would return three unrelated tabs. */
  fuzzyTarget: string;
};

export type SearchIndex = {
  entries: SearchEntry[];
  byId: Map<number, SearchEntry>;
};

export function buildIndex(tabs: TabSnapshot[], categoryOf: (t: TabSnapshot) => Category): SearchIndex {
  const entries = tabs.map((t) => {
    const category = categoryOf(t);
    return {
      id: t.id,
      haystack: `${t.title} ${t.url} ${t.domain} ${category}`.toLowerCase(),
      title: t.title.toLowerCase(),
      domain: t.domain.toLowerCase(),
      fuzzyTarget: `${t.title} ${t.domain}`.toLowerCase(),
    };
  });
  return { entries, byId: new Map(entries.map((e) => [e.id, e])) };
}

/** Subsequence match: "gthb" matches "github". Cheap, and the standard fuzzy behaviour. */
function subsequence(haystack: string, needle: string): boolean {
  let i = 0;
  for (let j = 0; j < haystack.length && i < needle.length; j++) {
    if (haystack[j] === needle[i]) i++;
  }
  return i === needle.length;
}

function scoreEntry(entry: SearchEntry, token: string): number {
  // Ordered by how strongly each signal implies "this is the tab you meant".
  if (entry.domain === token) return 100;
  if (entry.title.startsWith(token)) return 90;
  if (entry.domain.includes(token)) return 70;
  if (entry.title.includes(token)) return 60;
  if (entry.haystack.includes(token)) return 40;
  // Fuzzy is a last resort, and only for abbreviation-length tokens against the short
  // fields. Anything looser turns search into "show me everything, ranked badly".
  if (token.length >= 3 && subsequence(entry.fuzzyTarget, token)) return 15;
  return 0;
}

export type SearchResult = { id: number; score: number };

/**
 * `previous` is the result list from the last keystroke. Pass it whenever the new query
 * extends the old one — matches can only shrink, never grow, so re-scanning the full index
 * is wasted work.
 */
export function search(
  index: SearchIndex,
  query: string,
  previous?: SearchResult[],
): SearchResult[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return index.entries.map((e) => ({ id: e.id, score: 0 }));

  const tokens = trimmed.split(/\s+/);
  const pool: SearchEntry[] = previous
    ? previous.map((r) => index.byId.get(r.id)).filter((e): e is SearchEntry => e !== undefined)
    : index.entries;

  const out: SearchResult[] = [];
  for (const entry of pool) {
    let total = 0;
    let matchedAll = true;
    for (const token of tokens) {
      const s = scoreEntry(entry, token);
      if (s === 0) {
        matchedAll = false;
        break;
      }
      total += s;
    }
    if (matchedAll) out.push({ id: entry.id, score: total });
  }

  // Ties break on id so the list never reshuffles between identical keystrokes.
  return out.sort((a, b) => b.score - a.score || a.id - b.id);
}

/** True when `next` can be answered by filtering the results of `prev`. */
export function canReuse(prev: string, next: string): boolean {
  const p = prev.trim().toLowerCase();
  const n = next.trim().toLowerCase();
  return p.length > 0 && n.startsWith(p);
}
