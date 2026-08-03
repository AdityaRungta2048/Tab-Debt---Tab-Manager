import { useMemo, useState } from 'preact/hooks';
import { findDuplicates } from '@/core/duplicates/cluster';
import type { DuplicateTier, KeepStrategy } from '@/types/suggestion';
import type { TabSnapshot } from '@/types/tab';
import { Button, Empty } from '@/components/ui/primitives';

/**
 * The duplicates review. Never auto-closes: every cluster shows which tab survives and
 * which close, side by side, with the keep-strategy under the user's control.
 *
 * The three tiers are shown separately because they carry genuinely different risk, and
 * collapsing them into one number would hide that.
 */

const TIER_LABEL: Record<DuplicateTier, string> = {
  exact: 'Identical address',
  canonical: 'Same page, different tracking parameters',
  samePage: 'Same page, different query',
};

const TIER_NOTE: Record<DuplicateTier, string> = {
  exact: 'Byte-for-byte the same URL. Safe to collapse.',
  canonical: 'Differs only by tracking parameters, a trailing slash or an anchor.',
  samePage: 'Same site and path but a genuinely different query — two searches are not one page. Check these yourself.',
};

export function DuplicatesPanel({
  tabs,
  strategy,
  trackingParams,
  onClose,
  busy,
}: {
  tabs: TabSnapshot[];
  strategy: KeepStrategy;
  trackingParams: string[];
  onClose: (tabIds: number[], label: string) => void;
  busy: boolean;
}) {
  const [keep, setKeep] = useState<KeepStrategy>(strategy);
  const clusters = useMemo(
    () => findDuplicates(tabs, { strategy: keep, ...(trackingParams.length ? { trackingParams } : {}) }),
    [tabs, keep, trackingParams],
  );

  const byTier = useMemo(() => {
    const map = new Map<DuplicateTier, typeof clusters>();
    for (const c of clusters) map.set(c.tier, [...(map.get(c.tier) ?? []), c]);
    return map;
  }, [clusters]);

  if (clusters.length === 0) {
    return <Empty title="No duplicates.">Every open tab points somewhere different.</Empty>;
  }

  return (
    <div class="min-h-0 flex-1 overflow-y-auto">
      <div class="flex items-center gap-2 border-b border-rule px-3 py-2">
        <span class="text-2xs uppercase tracking-[0.1em] text-muted">Keep</span>
        {(['newest', 'oldest', 'pinned'] as KeepStrategy[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setKeep(s)}
            aria-pressed={keep === s}
            class={`rounded-sm border px-2 py-0.5 text-2xs capitalize ${keep === s ? 'border-ledger bg-ledger text-[color:var(--paper)]' : 'border-rule text-muted hover:bg-[color:var(--ledger-soft)]'}`}
          >
            {s}
          </button>
        ))}
      </div>

      {(['exact', 'canonical', 'samePage'] as DuplicateTier[]).map((tier) => {
        const list = byTier.get(tier);
        if (!list?.length) return null;
        const closable = list.flatMap((c) => c.close.map((t) => t.id));
        return (
          <section key={tier} class="border-b border-rule">
            <header class="flex items-start gap-3 bg-card px-3 py-2">
              <div class="min-w-0 flex-1">
                <h3 class="text-xs font-medium">{TIER_LABEL[tier]}</h3>
                <p class="mt-0.5 text-2xs text-muted">{TIER_NOTE[tier]}</p>
              </div>
              <Button
                variant="danger"
                disabled={busy || closable.length === 0}
                onClick={() => onClose(closable, `${closable.length} duplicates`)}
                class="shrink-0"
              >
                Close {closable.length}
              </Button>
            </header>

            {list.map((cluster) => (
              <div key={cluster.id} class="td-row px-3 py-1.5">
                <div class="flex items-center gap-2">
                  <span class="num w-14 shrink-0 text-2xs text-good">keep</span>
                  <span class="truncate text-xs">{cluster.keep.title || cluster.keep.url}</span>
                </div>
                {cluster.close.map((t) => (
                  <div key={t.id} class="flex items-center gap-2">
                    <span class="num w-14 shrink-0 text-2xs text-bad">close</span>
                    <span class="truncate text-xs text-muted line-through decoration-1">
                      {t.title || t.url}
                    </span>
                  </div>
                ))}
                {cluster.protectedTabs.map(({ tab, reason }) => (
                  <div key={tab.id} class="flex items-center gap-2">
                    <span class="num w-14 shrink-0 text-2xs text-faint">kept</span>
                    <span class="truncate text-xs text-muted">{tab.title || tab.url}</span>
                    <span class="ml-auto shrink-0 text-2xs text-warn">{reason}</span>
                  </div>
                ))}
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}
