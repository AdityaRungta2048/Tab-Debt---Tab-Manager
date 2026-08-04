import type { ComponentChildren, JSX } from 'preact';
import { formatMbBare } from '@/core/memory/estimate';

/**
 * Hand-rolled primitives. A component library's worth of unused code in a popup is a bug,
 * and everything here is small enough that vendoring a dependency would cost more than it
 * saves.
 */

// JSX.IntrinsicElements['button'] rather than HTMLAttributes<HTMLButtonElement>: the
// latter omits button-specific props, so `disabled` would not typecheck at the call sites.
type ButtonProps = JSX.IntrinsicElements['button'] & {
  variant?: 'primary' | 'quiet' | 'danger';
  size?: 'sm' | 'md';
};

export function Button({ variant = 'quiet', size = 'sm', class: cls, ...props }: ButtonProps) {
  const base =
    'inline-flex items-center justify-center gap-1.5 rounded-sm font-medium transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed';
  const sizes = { sm: 'h-6 px-2 text-xs', md: 'h-8 px-3 text-sm' };
  const variants = {
    primary: 'bg-ledger text-[color:var(--paper)] hover:opacity-90',
    quiet: 'border border-rule text-ink hover:bg-[color:var(--ledger-soft)]',
    danger: 'border border-bad text-bad hover:bg-bad-soft',
  };
  return <button {...props} class={`${base} ${sizes[size]} ${variants[variant]} ${cls ?? ''}`} />;
}

/**
 * The ONLY component permitted to render an estimated size. There is no per-tab memory API
 * in Chrome, so every one of these numbers is a heuristic — and a heuristic rendered
 * without a qualifier is a lie. See DECISIONS.md D-002.
 */
export function Estimated({
  mb,
  class: cls,
  labelledByColumn = false,
}: {
  mb: number;
  class?: string;
  /**
   * Set when a column header already carries the "(est.)" qualifier. Drops the visible
   * inline suffix only — the tooltip and the screen-reader text are never dropped, so the
   * number is still incapable of being presented as measured fact.
   */
  labelledByColumn?: boolean;
}) {
  return (
    <span
      class={`num whitespace-nowrap text-xs text-muted ${cls ?? ''}`}
      title="Estimated from a heuristic — Chrome has no per-tab memory API. Adjust the weights in Settings."
    >
      ~{formatMbBare(mb)}
      <span class="sr-only"> (estimated)</span>
      {!labelledByColumn && (
        <span aria-hidden="true" class="text-faint"> est.</span>
      )}
    </span>
  );
}

export function CategoryChip({ label, reason }: { label: string; reason: string }) {
  return (
    <span
      class="inline-block max-w-[7rem] truncate rounded-sm border border-rule px-1 text-2xs text-muted"
      title={`Why ${label}? ${reason}`}
    >
      {label}
    </span>
  );
}

export function Empty({ title, children }: { title: string; children?: ComponentChildren }) {
  return (
    <div class="px-4 py-10 text-center">
      <p class="text-sm font-medium">{title}</p>
      {children && <p class="mt-1 text-xs text-muted">{children}</p>}
    </div>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <div class="px-4 py-10 text-center text-xs text-muted" role="status">
      {label}
    </div>
  );
}

/** A labelled count, set in the numeric face like every number in the product. */
export function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div>
      <div class="num text-md font-medium">{typeof value === 'number' ? value.toLocaleString() : value}</div>
      <div class="text-2xs uppercase tracking-[0.1em] text-muted">{label}</div>
    </div>
  );
}
