import type { MemoryWeights as Weights } from '@/core/memory/estimate';
import { Button } from '@/components/ui/primitives';

/** Accepts a pasted URL as readily as a bare domain. */
function normaliseDomain(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '');
}

/**
 * The memory heuristic, exposed rather than hidden.
 *
 * Chrome gives extensions no per-tab memory API, so every size in the product is a guess.
 * Showing the guess's inputs — and letting the user change them — is the difference between
 * an honest heuristic and fake precision. See DECISIONS.md D-002.
 */
export function MemoryWeightsSection({
  weights,
  onChange,
}: {
  weights: Weights;
  onChange: (next: Weights) => void;
}) {
  const setHeavy = (heavy: Weights['heavy']): void => onChange({ ...weights, heavy });

  return (
    <section class="mt-6 border-t border-rule pt-4">
      <h2 class="text-sm font-medium">Size estimates</h2>
      <p class="mt-1 text-xs text-muted">
        Chrome does not expose per-tab memory to extensions, so every size in Tab Debt is an
        estimate from the weights below — a base cost per tab, multiplied for known-heavy sites.
        It is shown here rather than hidden so you can judge how much to trust it.
      </p>

      <div class="mt-2 flex items-center gap-3">
        <label class="flex items-center gap-1.5 text-xs">
          Base
          <input
            type="number"
            min={1}
            value={weights.base}
            onChange={(e) => {
              const base = Number((e.target as HTMLInputElement).value);
              if (Number.isFinite(base) && base > 0) onChange({ ...weights, base });
            }}
            class="num w-20 rounded-sm border border-rule bg-card px-2 py-1"
          />
          MB
        </label>
        <label class="flex items-center gap-1.5 text-xs">
          Sleeping
          <input
            type="number"
            min={0}
            value={weights.discarded}
            onChange={(e) => {
              const discarded = Number((e.target as HTMLInputElement).value);
              if (Number.isFinite(discarded) && discarded >= 0) onChange({ ...weights, discarded });
            }}
            class="num w-20 rounded-sm border border-rule bg-card px-2 py-1"
          />
          MB
        </label>
      </div>

      <details class="mt-2">
        <summary class="cursor-pointer text-xs text-ledger">
          Multipliers for heavy sites ({Object.keys(weights.heavy).length})
        </summary>

        <ul class="mt-1 space-y-1">
          {Object.entries(weights.heavy)
            // Heaviest first, then alphabetical, so the list does not reshuffle on edit.
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .map(([domain, multiplier]) => (
              <li key={domain} class="flex items-center gap-2">
                <span class="num flex-1 truncate text-2xs text-muted">{domain}</span>
                <span aria-hidden="true" class="text-2xs text-faint">
                  ×
                </span>
                <label>
                  <span class="sr-only">Multiplier for {domain}</span>
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={multiplier}
                    onChange={(e) => {
                      const next = Number((e.target as HTMLInputElement).value);
                      if (!Number.isFinite(next) || next < 0) return;
                      setHeavy({ ...weights.heavy, [domain]: next });
                    }}
                    class="num w-16 rounded-sm border border-rule bg-card px-1 py-0.5 text-2xs"
                  />
                </label>
                <Button
                  onClick={() => {
                    const heavy = { ...weights.heavy };
                    delete heavy[domain];
                    setHeavy(heavy);
                  }}
                >
                  Remove
                </Button>
              </li>
            ))}
          {Object.keys(weights.heavy).length === 0 && (
            <li class="text-2xs text-muted">
              No multipliers. Every tab is estimated at the base weight.
            </li>
          )}
        </ul>

        <form
          class="mt-2 flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget as HTMLFormElement;
            const domain = normaliseDomain(
              (form.elements.namedItem('heavyDomain') as HTMLInputElement).value,
            );
            const multiplier = Number(
              (form.elements.namedItem('heavyMultiplier') as HTMLInputElement).value,
            );
            if (!domain || !Number.isFinite(multiplier) || multiplier <= 0) return;
            setHeavy({ ...weights.heavy, [domain]: multiplier });
            form.reset();
          }}
        >
          <label class="flex-1">
            <span class="sr-only">Site to weigh differently</span>
            <input
              name="heavyDomain"
              type="text"
              placeholder="figma.com"
              class="num w-full rounded-sm border border-rule bg-card px-2 py-1 text-2xs"
            />
          </label>
          <label>
            <span class="sr-only">Multiplier</span>
            <input
              name="heavyMultiplier"
              type="number"
              min={0.5}
              step={0.5}
              value={3}
              class="num w-16 rounded-sm border border-rule bg-card px-1 py-1 text-2xs"
            />
          </label>
          <Button type="submit" variant="primary">
            Add site
          </Button>
        </form>
      </details>
    </section>
  );
}
