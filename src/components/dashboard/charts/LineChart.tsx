import { useId, useRef, useState } from 'preact/hooks';
import { shouldIncludeZero, type Point } from '@/core/analytics/series';
import { scaleFor, linePath, areaPath, ticks, nearestIndex, type Box } from '@/core/analytics/geometry';

/**
 * Single-series line chart. Hand-rolled SVG — no charting library, because none of them
 * fit the bundle budget and a line plus an axis is about forty lines of geometry that is
 * already unit-tested in core/analytics/geometry.ts.
 *
 * Deliberately single-series and single-hue. A category breakdown is rendered as small
 * multiples instead of six coloured lines: this product reserves its colour for the debt
 * score, and a rainbow would both break that rule and out-scale a readable palette.
 *
 * Never a second y-axis. Two measures of different scale are two charts.
 */

// padLeft reserves a gutter for the axis labels. Without it they either sit on the line
// (left-aligned) or collide with the endpoint marker (right-aligned) — I tried both.
const BOX: Box = { width: 600, height: 140, padTop: 6, padBottom: 18, padLeft: 34 };

export function LineChart({
  points,
  label,
  format = (n: number) => String(n),
}: {
  points: Point[];
  /** Names the series. With one series this replaces a legend entirely. */
  label: string;
  format?: (value: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const titleId = useId();

  if (points.length === 0) {
    return (
      <p class="px-1 py-6 text-center text-xs text-muted">
        No history yet. Tab Debt records one snapshot a day.
      </p>
    );
  }

  // Zero-base only when the data comes near zero. A 740-800 series forced to a zero
  // baseline renders as a flat line at the top of an empty box and communicates nothing.
  // When the axis is truncated the area fill is dropped: a filled area implies magnitude
  // measured from zero, so a truncated area would overstate the change. A truncated LINE
  // with labelled gridlines does not.
  const zeroBased = shouldIncludeZero(points);
  const scale = scaleFor(points, BOX, zeroBased);
  const gridValues = ticks(scale, 3);
  const active = hover !== null ? points[hover] : undefined;
  const last = points[points.length - 1]!;

  const move = (clientX: number): void => {
    const rect = svg.current?.getBoundingClientRect();
    if (!rect) return;
    const x = ((clientX - rect.left) / rect.width) * BOX.width;
    setHover(nearestIndex(points, x, BOX));
  };

  return (
    <figure class="m-0">
      <svg
        ref={svg}
        viewBox={`0 0 ${BOX.width} ${BOX.height}`}
        preserveAspectRatio="none"
        class="h-[140px] w-full touch-none"
        role="img"
        aria-labelledby={titleId}
        onMouseMove={(e) => move((e as MouseEvent).clientX)}
        onMouseLeave={() => setHover(null)}
      >
        <title id={titleId}>
          {label}: {points.length} days, from {format(points[0]!.value)} to {format(last.value)}.
        </title>

        {/* Recessive solid hairlines. Never dashed — dashing reads as a threshold. */}
        {gridValues.map((v) => (
          <g key={v}>
            <line
              x1={BOX.padLeft}
              x2={BOX.width}
              y1={scale.y(v)}
              y2={scale.y(v)}
              stroke="var(--rule)"
              stroke-width="1"
              vector-effect="non-scaling-stroke"
            />
            <text
              x={(BOX.padLeft ?? 0) - 5}
              y={scale.y(v) + 3}
              text-anchor="end"
              class="num"
              font-size="9"
              fill="var(--ink-faint)"
            >
              {format(v)}
            </text>
          </g>
        ))}

        {zeroBased && (
          <path d={areaPath(points, scale, BOX)} fill="var(--ledger)" opacity="0.10" />
        )}
        <path
          d={linePath(points, scale)}
          fill="none"
          stroke="var(--ledger)"
          stroke-width="2"
          stroke-linejoin="round"
          stroke-linecap="round"
          vector-effect="non-scaling-stroke"
        />

        {/* Only the endpoint is marked. A dot on every point is noise at 90 days. */}
        <circle
          cx={scale.x(points.length - 1)}
          cy={scale.y(last.value)}
          r="3.5"
          fill="var(--ledger)"
          stroke="var(--card)"
          stroke-width="2"
          vector-effect="non-scaling-stroke"
        />

        {active && hover !== null && (
          <g aria-hidden="true">
            <line
              x1={scale.x(hover)}
              x2={scale.x(hover)}
              y1={BOX.padTop}
              y2={BOX.height - BOX.padBottom}
              stroke="var(--ledger)"
              stroke-width="1"
              opacity="0.5"
              vector-effect="non-scaling-stroke"
            />
            <circle
              cx={scale.x(hover)}
              cy={scale.y(active.value)}
              r="4"
              fill="var(--ledger)"
              stroke="var(--card)"
              stroke-width="2"
              vector-effect="non-scaling-stroke"
            />
          </g>
        )}
      </svg>

      {/* The read-out lives outside the SVG so it is selectable text, and so the value is
          never reachable ONLY by hovering. */}
      <figcaption class="flex items-baseline justify-between px-1 pt-1 text-2xs text-muted">
        <span>{active ? active.day : `${points.length} days`}</span>
        <span class="num text-ink">
          {active ? format(active.value) : format(last.value)}
          {!active && <span class="text-muted"> today</span>}
        </span>
      </figcaption>
    </figure>
  );
}

/** Tiny inline line for the small-multiples rows. No axis, no hover — the row carries both. */
export function Sparkline({ points, width = 90 }: { points: Point[]; width?: number }) {
  if (points.length < 2) return <span class="inline-block" style={{ width: `${width}px` }} />;
  const box: Box = { width, height: 18, padTop: 2, padBottom: 2 };
  const scale = scaleFor(points, box);
  return (
    <svg
      viewBox={`0 0 ${width} 18`}
      class="shrink-0"
      style={{ width: `${width}px`, height: '18px' }}
      aria-hidden="true"
      focusable="false"
    >
      <path
        d={linePath(points, scale)}
        fill="none"
        stroke="var(--ledger)"
        stroke-width="1.5"
        stroke-linejoin="round"
        vector-effect="non-scaling-stroke"
      />
    </svg>
  );
}
