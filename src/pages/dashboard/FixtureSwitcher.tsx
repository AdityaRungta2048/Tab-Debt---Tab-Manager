import { FIXTURE_SIZES } from '@/test/fixtures/generate';

/**
 * Dev-only. Flip between the 50- and 800-tab scenarios and see the UI under both without
 * opening a single real tab. Tree-shaken out of the extension build by the `__MOCK__`
 * guard at every call site.
 */
export function FixtureSwitcher() {
  const current = Number(new URLSearchParams(location.search).get('fixture') ?? 400);
  return (
    <label class="flex items-center gap-1 text-2xs text-muted">
      <span class="sr-only">Fixture size</span>
      <select
        value={String(current)}
        onChange={(e) => {
          const size = (e.target as HTMLSelectElement).value;
          location.search = `?fixture=${size}`;
        }}
        class="rounded-sm border border-rule bg-card px-1 py-0.5 text-2xs"
      >
        {FIXTURE_SIZES.map((n) => (
          <option key={n} value={String(n)}>
            {n} tabs
          </option>
        ))}
      </select>
    </label>
  );
}
