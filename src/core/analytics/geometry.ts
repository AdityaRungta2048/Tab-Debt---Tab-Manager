import type { Point } from './series';

/**
 * Chart geometry as pure functions, so the SVG paths are unit-testable without a DOM and
 * the chart components stay dumb. No library: a line and an axis are about forty lines,
 * and a charting dependency in a popup-budgeted extension is not worth it.
 */

export type Box = {
  width: number;
  height: number;
  padTop: number;
  padBottom: number;
  /** Left gutter reserved for axis labels, so they never sit on top of the line. */
  padLeft?: number;
};

export type Scale = {
  x: (index: number) => number;
  y: (value: number) => number;
  min: number;
  max: number;
};

/**
 * A y-scale that always includes zero for counts, and pads a flat series so a constant
 * line renders through the middle rather than pinned to an edge (or dividing by zero).
 */
export function scaleFor(points: Point[], box: Box, includeZero = true): Scale {
  const values = points.map((p) => p.value);
  const rawMin = values.length ? Math.min(...values) : 0;
  const rawMax = values.length ? Math.max(...values) : 0;

  const min = includeZero ? Math.min(0, rawMin) : rawMin;
  let max = rawMax;
  if (max === min) {
    // Flat series: give it headroom instead of a zero-height plot.
    max = min + 1;
  }

  const plotHeight = box.height - box.padTop - box.padBottom;
  const left = box.padLeft ?? 0;
  const plotWidth = box.width - left;
  const span = Math.max(1, points.length - 1);

  return {
    min,
    max,
    x: (index) =>
      points.length <= 1 ? left + plotWidth / 2 : left + (index / span) * plotWidth,
    y: (value) => box.padTop + plotHeight - ((value - min) / (max - min)) * plotHeight,
  };
}

/** Polyline path. Straight segments, not curves: a smoothed line invents values. */
export function linePath(points: Point[], scale: Scale): string {
  if (points.length === 0) return '';
  if (points.length === 1) {
    const only = points[0]!;
    // A single point has no line; draw a short horizontal tick so it is visible at all.
    const y = round(scale.y(only.value));
    const x = round(scale.x(0));
    return `M ${x - 4} ${y} L ${x + 4} ${y}`;
  }
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${round(scale.x(i))} ${round(scale.y(p.value))}`)
    .join(' ');
}

/** Closed area under the line, for the faint fill beneath a growth curve. */
export function areaPath(points: Point[], scale: Scale, box: Box): string {
  if (points.length < 2) return '';
  const baseline = box.height - box.padBottom;
  const first = round(scale.x(0));
  const last = round(scale.x(points.length - 1));
  return `${linePath(points, scale)} L ${last} ${round(baseline)} L ${first} ${round(baseline)} Z`;
}

/**
 * Gridline values. Rounded to human numbers rather than exact fractions of the range —
 * an axis reading 0 / 233 / 467 / 700 is arithmetically correct and useless to read.
 */
export function ticks(scale: Scale, count = 3): number[] {
  const span = scale.max - scale.min;
  if (span <= 0) return [scale.min];
  const rough = span / count;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) ?? magnitude * 10;

  const out: number[] = [];
  for (let v = Math.ceil(scale.min / step) * step; v <= scale.max + 1e-9; v += step) {
    out.push(Math.round(v * 1000) / 1000);
  }
  return out;
}

/** Nearest data index for a pointer position — the hover hit test. */
export function nearestIndex(points: Point[], xPixel: number, box: Box): number {
  if (points.length === 0) return -1;
  if (points.length === 1) return 0;
  const left = box.padLeft ?? 0;
  const ratio = (xPixel - left) / Math.max(1, box.width - left);
  return Math.max(0, Math.min(points.length - 1, Math.round(ratio * (points.length - 1))));
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
