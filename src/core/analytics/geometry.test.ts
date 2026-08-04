import { describe, it, expect } from 'vitest';
import { scaleFor, linePath, areaPath, ticks, nearestIndex, type Box } from './geometry';
import type { Point } from './series';

const box: Box = { width: 300, height: 100, padTop: 4, padBottom: 16 };
const pts = (...values: number[]): Point[] =>
  values.map((value, i) => ({ day: `2026-07-${String(i + 1).padStart(2, '0')}`, value }));

describe('scaleFor', () => {
  it('includes zero for counts, so a rise from 90 to 100 does not look like a tripling', () => {
    const s = scaleFor(pts(90, 95, 100), box);
    expect(s.min).toBe(0);
    expect(s.max).toBe(100);
  });

  it('maps the max to the top of the plot and the min to the baseline', () => {
    const s = scaleFor(pts(0, 100), box);
    expect(s.y(100)).toBeCloseTo(box.padTop);
    expect(s.y(0)).toBeCloseTo(box.height - box.padBottom);
  });

  it('gives a flat series headroom rather than dividing by zero', () => {
    const s = scaleFor(pts(50, 50, 50), box);
    expect(Number.isFinite(s.y(50))).toBe(true);
    expect(s.max).toBeGreaterThan(s.min);
  });

  it('handles an all-zero series', () => {
    const s = scaleFor(pts(0, 0, 0), box);
    expect(Number.isFinite(s.y(0))).toBe(true);
  });

  it('handles an empty series without producing NaN', () => {
    const s = scaleFor([], box);
    expect(Number.isFinite(s.y(0))).toBe(true);
    expect(Number.isFinite(s.x(0))).toBe(true);
  });

  it('spreads x evenly across the full width', () => {
    const s = scaleFor(pts(1, 2, 3, 4, 5), box);
    expect(s.x(0)).toBe(0);
    expect(s.x(4)).toBe(box.width);
    expect(s.x(2)).toBeCloseTo(box.width / 2);
  });

  it('centres a single point instead of pinning it to the left edge', () => {
    expect(scaleFor(pts(7), box).x(0)).toBe(box.width / 2);
  });

  it('can opt out of including zero, for a score that never approaches it', () => {
    const s = scaleFor(pts(60, 70, 80), box, false);
    expect(s.min).toBe(60);
  });
});

describe('linePath', () => {
  it('starts with a move and continues with lines', () => {
    const points = pts(0, 50, 100);
    const path = linePath(points, scaleFor(points, box));
    expect(path.startsWith('M ')).toBe(true);
    expect(path.match(/L /g)).toHaveLength(2);
  });

  it('uses straight segments, never curves — a smoothed line invents values', () => {
    const points = pts(10, 90, 20, 80);
    const path = linePath(points, scaleFor(points, box));
    expect(path).not.toMatch(/[CQST]/);
  });

  it('produces nothing for an empty series', () => {
    expect(linePath([], scaleFor([], box))).toBe('');
  });

  it('draws a visible tick for a single point rather than an invisible zero-length path', () => {
    const points = pts(5);
    const path = linePath(points, scaleFor(points, box));
    expect(path).toMatch(/^M .* L /);
  });

  it('emits only finite coordinates', () => {
    for (const values of [[0], [0, 0], [5, 5, 5], [1, 1000000], [-5, 5]]) {
      const points = pts(...values);
      const path = linePath(points, scaleFor(points, box));
      expect(path, `NaN in path for ${values}`).not.toContain('NaN');
      expect(path).not.toContain('Infinity');
    }
  });
});

describe('areaPath', () => {
  it('closes back to the baseline', () => {
    const points = pts(10, 20, 30);
    const path = areaPath(points, scaleFor(points, box), box);
    expect(path.endsWith('Z')).toBe(true);
    expect(path).toContain(String(box.height - box.padBottom));
  });

  it('produces nothing when there is not enough data to enclose an area', () => {
    expect(areaPath(pts(1), scaleFor(pts(1), box), box)).toBe('');
    expect(areaPath([], scaleFor([], box), box)).toBe('');
  });
});

describe('ticks', () => {
  it('rounds to human numbers rather than exact fractions of the range', () => {
    const t = ticks(scaleFor(pts(0, 700), box), 3);
    // 0/233/467/700 would be arithmetically correct and useless to read.
    expect(t.every((v) => Number.isInteger(v))).toBe(true);
    expect(t).toContain(0);
    expect(t.length).toBeGreaterThanOrEqual(2);
  });

  it('never returns an empty axis for a flat series', () => {
    expect(ticks(scaleFor(pts(5, 5), box)).length).toBeGreaterThanOrEqual(1);
  });

  it('stays inside the scale', () => {
    const scale = scaleFor(pts(0, 123), box);
    for (const v of ticks(scale)) {
      expect(v).toBeGreaterThanOrEqual(scale.min);
      expect(v).toBeLessThanOrEqual(scale.max + 1e-6);
    }
  });

  it('produces a sane number of gridlines across very different magnitudes', () => {
    for (const max of [1, 10, 97, 800, 12_000]) {
      const count = ticks(scaleFor(pts(0, max), box), 3).length;
      expect(count, `max ${max} produced ${count} ticks`).toBeLessThanOrEqual(8);
      expect(count).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('nearestIndex — the hover hit test', () => {
  const points = pts(1, 2, 3, 4, 5);

  it('finds the closest point to a pointer position', () => {
    expect(nearestIndex(points, 0, box)).toBe(0);
    expect(nearestIndex(points, box.width, box)).toBe(4);
    expect(nearestIndex(points, box.width / 2, box)).toBe(2);
  });

  it('clamps outside the plot rather than returning an out-of-range index', () => {
    expect(nearestIndex(points, -50, box)).toBe(0);
    expect(nearestIndex(points, box.width + 500, box)).toBe(4);
  });

  it('returns -1 for no data', () => {
    expect(nearestIndex([], 10, box)).toBe(-1);
  });

  it('always returns the only point when there is one', () => {
    expect(nearestIndex(pts(9), 250, box)).toBe(0);
  });
});

/**
 * Regression for CRITIQUE #9: axis labels drawn at the plot's left edge sat on top of the
 * line, and moving them to the right edge made them collide with the endpoint marker
 * instead. The fix is a reserved gutter in the geometry, not a nudge in the component.
 */
describe('padLeft gutter', () => {
  const gutter: Box = { ...box, padLeft: 34 };

  it('starts the plot after the gutter, leaving room for labels', () => {
    const s = scaleFor(pts(0, 50, 100), gutter);
    expect(s.x(0)).toBe(34);
    expect(s.x(2)).toBe(gutter.width);
  });

  it('centres a single point within the plot area, not the whole box', () => {
    expect(scaleFor(pts(7), gutter).x(0)).toBe(34 + (300 - 34) / 2);
  });

  it('defaults to no gutter, so existing callers are unaffected', () => {
    expect(scaleFor(pts(1, 2), box).x(0)).toBe(0);
  });

  it('maps hover positions through the gutter rather than off by its width', () => {
    const points = pts(1, 2, 3, 4, 5);
    expect(nearestIndex(points, 34, gutter)).toBe(0);
    expect(nearestIndex(points, gutter.width, gutter)).toBe(4);
    // A pointer inside the gutter still resolves to the first point, never a negative index.
    expect(nearestIndex(points, 5, gutter)).toBe(0);
  });

  it('keeps the single-point tick inside the plot area', () => {
    const path = linePath(pts(5), scaleFor(pts(5), gutter));
    const xs = [...path.matchAll(/[ML] ([\d.]+)/g)].map((m) => Number(m[1]));
    expect(xs.length).toBeGreaterThan(0);
    for (const x of xs) expect(x).toBeGreaterThanOrEqual(34);
  });
});
