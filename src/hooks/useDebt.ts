import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { computeScore, emptyScore } from '@/core/score/score';
import { suggest } from '@/core/suggest/rank';
import { classifyAll } from '@/core/categorize/classify';
import { buildIndex } from '@/core/search/search';
import { getSnapshot } from '@/services/tabs.service';
import { read } from '@/services/storage.service';
import type { DebtInput, Categorization, TabSnapshot, Category } from '@/types/tab';
import type { DebtScore, Suggestion } from '@/types/suggestion';
import type { Settings } from '@/types/storage';
import { DEFAULT_SETTINGS } from '@/types/storage';

/**
 * The single source of truth for both surfaces. Everything expensive is memoised on the
 * snapshot, and the recompute is debounced — a burst of tab events must not make the score
 * jitter or the register re-sort under the user's cursor.
 */

const RECOMPUTE_DEBOUNCE_MS = 250;

export type DebtState = {
  loading: boolean;
  input: DebtInput;
  settings: Settings;
  score: DebtScore;
  suggestions: Suggestion[];
  categories: Map<TabSnapshot, Categorization>;
  categoryOf: (t: TabSnapshot) => Category;
  index: ReturnType<typeof buildIndex>;
  refresh: () => void;
};

const EMPTY_INPUT: DebtInput = { tabs: [], windowCount: 0, now: Date.now(), baseline: 25 };

export function useDebt(): DebtState {
  const [input, setInput] = useState<DebtInput>(EMPTY_INPUT);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const timer = useRef<number | undefined>(undefined);

  const load = useCallback(async () => {
    const [snapshot, loaded] = await Promise.all([getSnapshot(), read.settings()]);
    setInput(snapshot);
    setSettings(loaded);
    setLoading(false);
  }, []);

  /** Debounced so a burst of tab events produces one recompute, not forty. */
  const scheduleReload = useCallback(() => {
    if (timer.current !== undefined) clearTimeout(timer.current);
    timer.current = setTimeout(() => void load(), RECOMPUTE_DEBOUNCE_MS) as unknown as number;
  }, [load]);

  useEffect(() => {
    void load();

    // Every addListener has a matching removeListener. A leaked listener in a page that
    // opens and closes all day is a slow memory leak and a stack of duplicate recomputes.
    const onChange = (): void => scheduleReload();
    chrome.tabs.onCreated.addListener(onChange);
    chrome.tabs.onRemoved.addListener(onChange);
    chrome.tabs.onUpdated.addListener(onChange);
    chrome.tabs.onActivated.addListener(onChange);

    return () => {
      if (timer.current !== undefined) clearTimeout(timer.current);
      chrome.tabs.onCreated.removeListener(onChange);
      chrome.tabs.onRemoved.removeListener(onChange);
      chrome.tabs.onUpdated.removeListener(onChange);
      chrome.tabs.onActivated.removeListener(onChange);
    };
  }, [load, scheduleReload]);

  const categories = useMemo(
    () => classifyAll(input.tabs, settings.overrides),
    [input.tabs, settings.overrides],
  );

  const categoryOf = useCallback(
    (t: TabSnapshot): Category => categories.get(t)?.category ?? 'Other',
    [categories],
  );

  const score = useMemo(
    () => (input.tabs.length === 0 ? emptyScore() : computeScore(input, settings.trackingParams)),
    [input, settings.trackingParams],
  );

  const suggestions = useMemo(
    () =>
      suggest(input, {
        overrides: settings.overrides,
        weights: settings.memoryWeights,
        trackingParams: settings.trackingParams,
      }),
    [input, settings.overrides, settings.memoryWeights, settings.trackingParams],
  );

  const index = useMemo(() => buildIndex(input.tabs, categoryOf), [input.tabs, categoryOf]);

  return {
    loading,
    input,
    settings,
    score,
    suggestions,
    categories,
    categoryOf,
    index,
    refresh: load,
  };
}
