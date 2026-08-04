import { useEffect, useRef, useState } from 'preact/hooks';
import type { DebtScore, ScoreFactorId } from '@/types/suggestion';

/**
 * THE SIGNATURE ELEMENT (see DESIGN.md).
 *
 * The debt score rendered as a statement balance, with a single stacked bar beneath it in
 * which each segment is one scoring factor sized by its point contribution. Every segment
 * is a button: hovering names the factor and its points, clicking runs that factor's
 * remedy. The chart IS the control surface, rather than a chart plus a legend plus a
 * separate list of buttons.
 */

const STATE_TEXT = { good: 'text-good', warn: 'text-warn', bad: 'text-bad' } as const;
const STATE_BG = { good: 'bg-good', warn: 'bg-warn', bad: 'bg-bad' } as const;
const STATE_SOFT = { good: 'bg-good-soft', warn: 'bg-warn-soft', bad: 'bg-bad-soft' } as const;
const STATE_LABEL = { good: 'Manageable', warn: 'Building up', bad: 'Overdue' } as const;

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Counts to the new value so paying down debt is felt, not merely displayed. */
function useCountUp(target: number, duration = 450): number {
  const [value, setValue] = useState(target);
  const from = useRef(target);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setValue(target);
      from.current = target;
      return;
    }
    const start = performance.now();
    const origin = from.current;
    let raf = 0;
    const tick = (now: number): void => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(origin + (target - origin) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return value;
}

export type BalanceBarProps = {
  score: DebtScore;
  tabCount: number;
  onFactor?: (id: ScoreFactorId) => void;
  compact?: boolean;
};

export function BalanceBar({ score, tabCount, onFactor, compact = false }: BalanceBarProps) {
  const displayed = useCountUp(score.value);
  const scored = score.factors.filter((f) => f.points > 0);
  const total = scored.reduce((sum, f) => sum + f.points, 0);

  return (
    <section aria-label="Tab debt balance" class="border-b border-rule">
      {/* The tinted band is confined to the balance figure and its bar. Letting it run
          under the factor list too made a third of the viewport a coloured field — the
          opposite of "spend your boldness in exactly one place". */}
      <div class={`${STATE_SOFT[score.state]} px-4 ${compact ? 'py-3' : 'py-4'}`}>
        <div class="flex items-end justify-between gap-4">
          <div>
            <div class="text-2xs uppercase tracking-[0.12em] text-muted">Balance</div>
            <div class="flex items-baseline gap-2">
              {/* The numeral is decorative to assistive tech; the label beside it carries meaning. */}
              <span
                aria-hidden="true"
                class={`num ${compact ? 'text-[40px]' : 'text-[52px]'} font-medium leading-none ${STATE_TEXT[score.state]}`}
              >
                {displayed}
              </span>
              <span class="sr-only">
                Debt score {score.value} out of 100. {STATE_LABEL[score.state]}.
              </span>
              <span class="num text-xs text-muted">/ 100</span>
            </div>
          </div>
          <div class="text-right">
            <div class={`text-xs font-medium ${STATE_TEXT[score.state]}`}>
              {STATE_LABEL[score.state]}
            </div>
            <div class="num text-xs text-muted">
              {tabCount.toLocaleString()} {tabCount === 1 ? 'tab' : 'tabs'}
            </div>
          </div>
        </div>

        {/* The stacked factor bar. Segments step through an opacity ramp so each is
            individually legible while the design still spends only one hue. */}
        <div
          class="mt-3 flex h-2 w-full overflow-hidden rounded-sm bg-rule"
          role="list"
          aria-label="What makes up this score"
        >
          {scored.map((f, i) => (
            <button
              key={f.id}
              role="listitem"
              type="button"
              onClick={() => onFactor?.(f.id)}
              disabled={!onFactor}
              title={`${f.label}: ${f.points} points. ${f.detail}`}
              aria-label={`${f.label}, ${f.points} points. ${f.detail}${onFactor ? ' Activate to fix.' : ''}`}
              class={`${STATE_BG[score.state]} h-full border-r border-[color:var(--paper)] transition-[width] duration-150 last:border-r-0 disabled:cursor-default enabled:hover:opacity-100 enabled:focus-visible:opacity-100`}
              style={{
                width: `${total > 0 ? (f.points / total) * 100 : 0}%`,
                opacity: 1 - Math.min(i, 5) * 0.13,
              }}
            />
          ))}
          {scored.length === 0 && <div class="h-full w-full bg-good" aria-hidden="true" />}
        </div>
      </div>

      {scored.length > 0 && !compact && (
        <ul class="px-4 py-2">
          {scored.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                onClick={() => onFactor?.(f.id)}
                disabled={!onFactor}
                class="flex w-full items-baseline gap-2 rounded-sm py-0.5 text-left enabled:hover:bg-[color:var(--ledger-soft)]"
              >
                <span
                  class={`num w-9 shrink-0 text-right text-xs font-medium ${STATE_TEXT[score.state]}`}
                >
                  +{f.points}
                </span>
                <span class="shrink-0 text-xs font-medium">{f.label}</span>
                <span class="truncate text-xs text-muted">{f.detail}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {scored.length === 0 && (
        <p class="px-4 py-2 text-xs text-muted">
          Nothing to pay down. Your tabs are inside your comfortable baseline.
        </p>
      )}
    </section>
  );
}
