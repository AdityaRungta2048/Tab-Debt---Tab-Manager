import { useEffect, useMemo, useState } from 'preact/hooks';
import type { DailyRow } from '@/types/storage';
import type { TabSnapshot, Category } from '@/types/tab';
import { read } from '@/services/storage.service';
import {
  trend,
  categoryTrends,
  cleanupStats,
  describeTrend,
  window as windowRows,
} from '@/core/analytics/series';
import { toCsv, csvFilename } from '@/core/export/csv';
import { estimateTabMb } from '@/core/memory/estimate';
import { formatAge } from '@/core/staleness/buckets';
import { LineChart, Sparkline } from './charts/LineChart';
import { Button, Empty, Stat } from '@/components/ui/primitives';

/**
 * Trends, read entirely from the per-day roll-ups. There is no per-event history to mine —
 * that is a storage decision, not an oversight — so nothing here can show more resolution
 * than one point per day, and it does not pretend otherwise.
 *
 * One time-range control above everything, scoping every chart. Not per-chart filters.
 */

const RANGES = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
] as const;

export function TrendsPanel({
  tabs,
  categoryOf,
  now,
  onMessage,
}: {
  tabs: TabSnapshot[];
  categoryOf: (t: TabSnapshot) => Category;
  now: number;
  onMessage: (message: string) => void;
}) {
  const [rows, setRows] = useState<DailyRow[]>([]);
  const [days, setDays] = useState<number>(30);
  const [asTable, setAsTable] = useState(false);

  useEffect(() => {
    void read.daily().then((s) => setRows(s.rows));
  }, []);

  const windowed = useMemo(() => windowRows(rows, days), [rows, days]);
  const tabsTrend = useMemo(() => trend(rows, 'tabs', days), [rows, days]);
  const scoreTrend = useMemo(() => trend(rows, 'score', days), [rows, days]);
  const categories = useMemo(() => categoryTrends(rows, days, 8), [rows, days]);
  const stats = useMemo(() => cleanupStats(rows, now), [rows, now]);

  const downloadCsv = (name: string, csv: string): void => {
    // A local blob URL. Nothing is uploaded — see PRIVACY.md.
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
    onMessage(`Exported ${name}`);
  };

  const exportTabs = (): void =>
    downloadCsv(
      csvFilename('tabs'),
      toCsv(tabs, [
        { header: 'Title', value: (t) => t.title },
        { header: 'URL', value: (t) => t.url },
        { header: 'Site', value: (t) => t.domain },
        { header: 'Category', value: (t) => categoryOf(t) },
        { header: 'Last used', value: (t) => formatAge(t, now) },
        { header: 'Estimated MB', value: (t) => estimateTabMb(t) },
        { header: 'Pinned', value: (t) => t.pinned },
        { header: 'Window', value: (t) => t.windowId },
      ]),
    );

  const exportHistory = (): void =>
    downloadCsv(
      csvFilename('history'),
      toCsv(windowed, [
        { header: 'Day', value: (r) => r.day },
        { header: 'Tabs', value: (r) => r.tabs },
        { header: 'Debt score', value: (r) => r.score },
        { header: 'Tabs closed', value: (r) => r.closed },
        { header: 'Cleanups', value: (r) => r.cleanups },
      ]),
    );

  return (
    <div class="min-h-0 flex-1 overflow-y-auto">
      {/* One filter row above everything it scopes. */}
      <div class="flex flex-wrap items-center gap-2 border-b border-rule px-3 py-2">
        <span class="text-2xs uppercase tracking-[0.1em] text-muted">Range</span>
        {RANGES.map((r) => (
          <button
            key={r.days}
            type="button"
            onClick={() => setDays(r.days)}
            aria-pressed={days === r.days}
            class={`rounded-sm border px-1.5 py-0.5 text-2xs ${
              days === r.days
                ? 'border-ledger bg-ledger text-[color:var(--paper)]'
                : 'border-rule text-muted hover:bg-[color:var(--ledger-soft)]'
            }`}
          >
            {r.label}
          </button>
        ))}

        <div class="ml-auto flex items-center gap-1.5">
          <Button onClick={() => setAsTable((v) => !v)} aria-pressed={asTable}>
            {asTable ? 'Show charts' : 'Show table'}
          </Button>
          <Button onClick={exportHistory} disabled={windowed.length === 0}>
            Export history CSV
          </Button>
          <Button onClick={exportTabs}>Export tabs CSV</Button>
        </div>
      </div>

      <div class="grid grid-cols-4 gap-3 border-b border-rule px-4 py-3">
        <Stat value={stats.streak} label="Day streak" />
        <Stat value={stats.longestStreak} label="Longest streak" />
        <Stat value={stats.totalClosed} label="Tabs closed" />
        <Stat value={stats.totalCleanups} label="Cleanups" />
      </div>

      {rows.length === 0 ? (
        <Empty title="No history yet.">
          Tab Debt records one snapshot a day. Come back tomorrow and there will be a line here.
        </Empty>
      ) : asTable ? (
        <HistoryTable rows={windowed} />
      ) : (
        <>
          <ChartCard
            title="Tabs open"
            caption={describeTrend(tabsTrend, 'tab')}
            chart={<LineChart points={tabsTrend.points} label="Tabs open" />}
          />
          {/* A separate chart, never a second y-axis on the one above. */}
          <ChartCard
            title="Debt score"
            caption={describeTrend(scoreTrend, 'point')}
            chart={<LineChart points={scoreTrend.points} label="Debt score" />}
          />

          <section class="border-b border-rule">
            <header class="px-4 pb-1 pt-3">
              <h3 class="text-xs font-medium">By category</h3>
              <p class="mt-0.5 text-2xs text-muted">
                One row per category rather than eight coloured lines — a rainbow would be
                unreadable here and this product spends its colour on the score.
              </p>
            </header>
            <ul>
              {categories.map((c) => (
                <li key={c.category} class="td-row flex items-center gap-3 px-4 py-1 last:border-b-0">
                  <span class="w-28 shrink-0 truncate text-xs">
                    {c.category === 'Other' ? 'Uncategorised' : c.category}
                  </span>
                  <Sparkline points={c.points} />
                  <span class="num ml-auto text-xs">{c.latest}</span>
                </li>
              ))}
              {categories.length === 0 && (
                <li class="px-4 py-3 text-xs text-muted">No category history in this range.</li>
              )}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

function ChartCard({
  title,
  caption,
  chart,
}: {
  title: string;
  caption: string;
  chart: preact.ComponentChildren;
}) {
  return (
    <section class="border-b border-rule px-4 py-3">
      <header class="flex items-baseline justify-between">
        <h3 class="text-xs font-medium">{title}</h3>
        <p class="text-2xs text-muted">{caption}</p>
      </header>
      <div class="mt-2">{chart}</div>
    </section>
  );
}

/** The table twin. Every value in the charts above is readable here without hovering. */
function HistoryTable({ rows }: { rows: DailyRow[] }) {
  return (
    <table class="w-full text-xs">
      <caption class="sr-only">Daily history: tabs open, debt score, tabs closed and cleanups</caption>
      <thead>
        <tr class="border-b border-rule text-2xs uppercase tracking-[0.1em] text-muted">
          <th scope="col" class="px-4 py-1 text-left font-normal">Day</th>
          <th scope="col" class="px-2 py-1 text-right font-normal">Tabs</th>
          <th scope="col" class="px-2 py-1 text-right font-normal">Score</th>
          <th scope="col" class="px-2 py-1 text-right font-normal">Closed</th>
          <th scope="col" class="px-4 py-1 text-right font-normal">Cleanups</th>
        </tr>
      </thead>
      <tbody>
        {[...rows].reverse().map((r) => (
          <tr key={r.day} class="td-row">
            <td class="num px-4 py-1">{r.day}</td>
            <td class="num px-2 py-1 text-right">{r.tabs}</td>
            <td class="num px-2 py-1 text-right">{r.score}</td>
            <td class="num px-2 py-1 text-right">{r.closed || '—'}</td>
            <td class="num px-4 py-1 text-right">{r.cleanups || '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
