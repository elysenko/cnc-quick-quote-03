/**
 * Arc / circle / bulge flattening helpers. Everything here works in raw
 * drawing units; unit scaling happens in the service.
 */
import { Bounds } from './dxf-types';

export const TWO_PI = Math.PI * 2;
export const MAX_ARC_SEGMENTS = 512;
export const MIN_ARC_SEGMENTS = 2;

export function emptyBounds(): Bounds {
  return {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  };
}

export function expandBounds(b: Bounds, x: number, y: number): void {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return;
  }
  if (x < b.minX) b.minX = x;
  if (y < b.minY) b.minY = y;
  if (x > b.maxX) b.maxX = x;
  if (y > b.maxY) b.maxY = y;
}

export function boundsAreEmpty(b: Bounds): boolean {
  return !Number.isFinite(b.minX) || !Number.isFinite(b.minY);
}

/** Normalise an angle into [0, 2π). */
export function normaliseAngle(a: number): number {
  const m = a % TWO_PI;
  return m < 0 ? m + TWO_PI : m;
}

/**
 * Number of chords needed to approximate an arc of radius `r` sweeping
 * `sweep` radians within `tol` drawing units of sagitta error.
 *
 *   n = clamp(ceil(theta / (2 * acos(max(-1, 1 - tol / r)))), 2, 512)
 */
export function segmentCount(
  r: number,
  sweep: number,
  tol: number,
  maxSegments: number = MAX_ARC_SEGMENTS,
): number {
  const theta = Math.abs(sweep);
  const upper = Math.max(MIN_ARC_SEGMENTS, Math.trunc(maxSegments));
  if (!(r > 0) || !Number.isFinite(r) || !(theta > 0)) {
    return MIN_ARC_SEGMENTS;
  }
  const safeTol = Number.isFinite(tol) && tol > 0 ? tol : 1e-6;
  const cosArg = Math.max(-1, Math.min(1, 1 - safeTol / r));
  const perSegment = 2 * Math.acos(cosArg);
  if (!(perSegment > 0)) {
    // tol is so small the maths underflows: fall back to the hard cap.
    return upper;
  }
  const n = Math.ceil(theta / perSegment);
  if (!Number.isFinite(n)) {
    return upper;
  }
  return Math.max(MIN_ARC_SEGMENTS, Math.min(upper, n));
}

/**
 * Append a flattened arc to `out` (a flat [x,y,...] array). The first point is
 * skipped when `out` already ends at the arc start, so polylines stay
 * continuous. `sweep` is signed: positive = counter-clockwise.
 */
export function flattenArc(
  out: number[],
  cx: number,
  cy: number,
  r: number,
  startRad: number,
  sweep: number,
  tol: number,
  maxSegments: number = MAX_ARC_SEGMENTS,
): void {
  const n = segmentCount(r, sweep, tol, maxSegments);
  const step = sweep / n;
  for (let i = 0; i <= n; i += 1) {
    const a = startRad + step * i;
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    if (i === 0 && out.length >= 2) {
      const dx = out[out.length - 2] - x;
      const dy = out[out.length - 1] - y;
      if (dx * dx + dy * dy < 1e-18) {
        continue;
      }
    }
    out.push(x, y);
  }
}

/** Is `angle` inside the sweep starting at `start`? */
function angleInSweep(angle: number, start: number, sweep: number): boolean {
  const eps = 1e-12;
  if (sweep >= 0) {
    return normaliseAngle(angle - start) <= sweep + eps;
  }
  return normaliseAngle(start - angle) <= -sweep + eps;
}

/**
 * Exact analytic bounds of an arc: its two endpoints plus whichever of the
 * four axis extremes the sweep actually crosses.
 */
export function expandArcBounds(
  b: Bounds,
  cx: number,
  cy: number,
  r: number,
  startRad: number,
  sweep: number,
): void {
  expandBounds(b, cx + r * Math.cos(startRad), cy + r * Math.sin(startRad));
  const endRad = startRad + sweep;
  expandBounds(b, cx + r * Math.cos(endRad), cy + r * Math.sin(endRad));
  for (let k = 0; k < 4; k += 1) {
    const a = (k * Math.PI) / 2;
    if (angleInSweep(a, startRad, sweep)) {
      expandBounds(b, cx + r * Math.cos(a), cy + r * Math.sin(a));
    }
  }
}

export interface BulgeArc {
  cx: number;
  cy: number;
  r: number;
  startRad: number;
  /** Signed sweep in radians; positive = counter-clockwise. */
  sweep: number;
}

/**
 * Convert a DXF bulge between two vertices into an arc.
 *
 * The included angle is `theta = 4 * atan(bulge)`, signed (positive = CCW).
 * The centre sits on the chord's left normal at distance
 * `(d / 4) * (1 / b - b)` from the chord midpoint.
 *
 * Returns null for a straight segment (bulge 0) or a degenerate chord.
 */
export function bulgeToArc(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  bulge: number,
): BulgeArc | null {
  if (!Number.isFinite(bulge) || bulge === 0) {
    return null;
  }
  const dx = x2 - x1;
  const dy = y2 - y1;
  const d = Math.hypot(dx, dy);
  if (!(d > 1e-12)) {
    return null;
  }
  const theta = 4 * Math.atan(bulge);
  const halfSin = Math.sin(theta / 2);
  if (Math.abs(halfSin) < 1e-12) {
    return null;
  }
  const r = Math.abs(d / (2 * halfSin));
  // Left-hand normal of the chord.
  const nx = -dy / d;
  const ny = dx / d;
  const h = (d / 4) * (1 / bulge - bulge);
  const cx = (x1 + x2) / 2 + nx * h;
  const cy = (y1 + y2) / 2 + ny * h;
  const startRad = Math.atan2(y1 - cy, x1 - cx);
  return { cx, cy, r, startRad, sweep: theta };
}

/** Sum of the Euclidean lengths of every segment of a flat point array. */
export function polylineLength(flat: number[]): number {
  let total = 0;
  for (let i = 2; i < flat.length; i += 2) {
    total += Math.hypot(flat[i] - flat[i - 2], flat[i + 1] - flat[i - 1]);
  }
  return total;
}
