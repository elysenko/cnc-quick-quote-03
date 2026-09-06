import { Injectable, Logger } from '@nestjs/common';
import {
  Bounds,
  DxfEntity,
  DxfParseError,
  ParsedGeometry,
} from './dxf-types';
import { decodeDxf, extractEntities, readInsUnits, tokenize } from './dxf-tokenizer';
import {
  MAX_ARC_SEGMENTS,
  TWO_PI,
  boundsAreEmpty,
  bulgeToArc,
  emptyBounds,
  expandArcBounds,
  expandBounds,
  flattenArc,
  normaliseAngle,
  polylineLength,
} from './dxf-flatten';

/** Hard ceiling on emitted vertices so one pathological file cannot blow up
 *  memory or the downstream nesting step. */
const MAX_TOTAL_VERTICES = 20000;
/** Flattening tolerance as a fraction of the bounding-box diagonal. */
const TOLERANCE_RATIO = 0.0005;
const MIN_TOLERANCE = 1e-6;

interface UnitInfo {
  /** Multiply drawing units by this to get inches. */
  scale: number;
  detectedUnits: string;
}

const UNIT_TABLE: Record<number, { label: string; scale: number }> = {
  1: { label: 'in', scale: 1 },
  4: { label: 'mm', scale: 1 / 25.4 },
  5: { label: 'cm', scale: 1 / 2.54 },
  6: { label: 'm', scale: 39.3701 },
};

const MM_SCALE = 1 / 25.4;

export function resolveUnits(insunits: number | null): UnitInfo {
  if (insunits === null) {
    return {
      scale: MM_SCALE,
      detectedUnits: 'mm (default, $INSUNITS absent)',
    };
  }
  if (insunits === 0) {
    return {
      scale: MM_SCALE,
      detectedUnits: 'mm (default, $INSUNITS = 0 / unitless)',
    };
  }
  const known = UNIT_TABLE[insunits];
  if (known) {
    return {
      scale: known.scale,
      detectedUnits: `${known.label} ($INSUNITS = ${insunits})`,
    };
  }
  return {
    scale: MM_SCALE,
    detectedUnits: `mm (assumed, unsupported $INSUNITS = ${insunits})`,
  };
}

/** Signed CCW sweep from startDeg to endDeg; a zero sweep means a full turn. */
function arcSweep(startDeg: number, endDeg: number): number {
  const sweep = normaliseAngle(((endDeg - startDeg) * Math.PI) / 180);
  return sweep < 1e-9 ? TWO_PI : sweep;
}

/**
 * Accumulate a drawing bounding box. `exact` computes true arc extents;
 * otherwise circles/arcs contribute their (over-estimated) centre +/- radius
 * box, which is all the first tolerance pass needs.
 */
function accumulateBounds(entities: DxfEntity[], exact: boolean): Bounds {
  const b = emptyBounds();
  for (const e of entities) {
    switch (e.type) {
      case 'LINE':
        expandBounds(b, e.x1, e.y1);
        expandBounds(b, e.x2, e.y2);
        break;
      case 'CIRCLE':
        expandBounds(b, e.cx - e.r, e.cy - e.r);
        expandBounds(b, e.cx + e.r, e.cy + e.r);
        break;
      case 'ARC':
        if (exact) {
          expandArcBounds(
            b,
            e.cx,
            e.cy,
            e.r,
            (e.startDeg * Math.PI) / 180,
            arcSweep(e.startDeg, e.endDeg),
          );
        } else {
          expandBounds(b, e.cx - e.r, e.cy - e.r);
          expandBounds(b, e.cx + e.r, e.cy + e.r);
        }
        break;
      case 'POLYLINE': {
        const n = e.vertices.length;
        const last = e.closed ? n : n - 1;
        for (const v of e.vertices) {
          expandBounds(b, v.x, v.y);
        }
        for (let i = 0; i < last; i += 1) {
          const a = e.vertices[i];
          const c = e.vertices[(i + 1) % n];
          const arc = bulgeToArc(a.x, a.y, c.x, c.y, a.bulge);
          if (!arc) {
            continue;
          }
          if (exact) {
            expandArcBounds(b, arc.cx, arc.cy, arc.r, arc.startRad, arc.sweep);
          } else {
            expandBounds(b, arc.cx - arc.r, arc.cy - arc.r);
            expandBounds(b, arc.cx + arc.r, arc.cy + arc.r);
          }
        }
        break;
      }
      default:
        break;
    }
  }
  return b;
}

function flattenEntity(
  e: DxfEntity,
  tol: number,
  maxSegments: number,
): number[] {
  switch (e.type) {
    case 'LINE':
      return [e.x1, e.y1, e.x2, e.y2];
    case 'CIRCLE': {
      const out: number[] = [];
      flattenArc(out, e.cx, e.cy, e.r, 0, TWO_PI, tol, maxSegments);
      return out;
    }
    case 'ARC': {
      const out: number[] = [];
      flattenArc(
        out,
        e.cx,
        e.cy,
        e.r,
        (e.startDeg * Math.PI) / 180,
        arcSweep(e.startDeg, e.endDeg),
        tol,
        maxSegments,
      );
      return out;
    }
    case 'POLYLINE': {
      const verts = e.vertices;
      const n = verts.length;
      const out: number[] = [verts[0].x, verts[0].y];
      const segments = e.closed ? n : n - 1;
      for (let i = 0; i < segments; i += 1) {
        const a = verts[i];
        const c = verts[(i + 1) % n];
        const arc = bulgeToArc(a.x, a.y, c.x, c.y, a.bulge);
        if (arc) {
          flattenArc(
            out,
            arc.cx,
            arc.cy,
            arc.r,
            arc.startRad,
            arc.sweep,
            tol,
            maxSegments,
          );
          // Snap the arc end onto the declared vertex to avoid drift.
          out[out.length - 2] = c.x;
          out[out.length - 1] = c.y;
        } else {
          out.push(c.x, c.y);
        }
      }
      return out;
    }
    default:
      return [];
  }
}

function flattenAll(
  entities: DxfEntity[],
  tol: number,
  maxSegments: number,
): number[][] {
  const polylines: number[][] = [];
  for (const e of entities) {
    const flat = flattenEntity(e, tol, maxSegments);
    if (flat.length >= 4) {
      polylines.push(flat);
    }
  }
  return polylines;
}

function countVertices(polylines: number[][]): number {
  let total = 0;
  for (const p of polylines) {
    total += p.length / 2;
  }
  return total;
}

@Injectable()
export class DxfParserService {
  private readonly logger = new Logger(DxfParserService.name);

  parse(data: Buffer): ParsedGeometry {
    const text = decodeDxf(data);
    const tokens = tokenize(text);
    const { scale, detectedUnits } = resolveUnits(readInsUnits(tokens));
    const entities = extractEntities(tokens);

    if (entities.length === 0) {
      throw new DxfParseError(
        'This DXF contains no lines, arcs, circles or polylines we can cut. ' +
          'Please export the part geometry (not just text or dimensions) and ' +
          'upload it again.',
      );
    }

    // Pass 1: analytic bounds give us a drawing-relative flattening tolerance.
    const rough = accumulateBounds(entities, false);
    const diag = boundsAreEmpty(rough)
      ? 0
      : Math.hypot(rough.maxX - rough.minX, rough.maxY - rough.minY);
    let tol = Math.max(diag * TOLERANCE_RATIO, MIN_TOLERANCE);
    let maxSegments = MAX_ARC_SEGMENTS;

    // Pass 2: flatten, coarsening if we blow the vertex budget.
    let polylines = flattenAll(entities, tol, maxSegments);
    let vertices = countVertices(polylines);
    for (let attempt = 0; attempt < 5 && vertices > MAX_TOTAL_VERTICES; attempt += 1) {
      const ratio = vertices / MAX_TOTAL_VERTICES;
      // Chord count scales with 1/sqrt(tol), so square the ratio.
      tol *= ratio * ratio;
      maxSegments = Math.max(2, Math.floor(maxSegments / 2));
      this.logger.warn(
        `DXF flattening produced ${vertices} vertices (cap ${MAX_TOTAL_VERTICES}); ` +
          `re-flattening with tolerance ${tol.toExponential(3)} and at most ` +
          `${maxSegments} segments per arc.`,
      );
      polylines = flattenAll(entities, tol, maxSegments);
      vertices = countVertices(polylines);
    }

    const bounds = accumulateBounds(entities, true);
    const minX = Number.isFinite(bounds.minX) ? bounds.minX : 0;
    const minY = Number.isFinite(bounds.minY) ? bounds.minY : 0;
    const width = Number.isFinite(bounds.maxX) ? bounds.maxX - minX : 0;
    const height = Number.isFinite(bounds.maxY) ? bounds.maxY - minY : 0;

    // Scale to inches and translate so the bbox minimum corner is (0,0).
    let cutLengthIn = 0;
    for (const flat of polylines) {
      for (let i = 0; i < flat.length; i += 2) {
        flat[i] = (flat[i] - minX) * scale;
        flat[i + 1] = (flat[i + 1] - minY) * scale;
      }
      cutLengthIn += polylineLength(flat);
    }

    const result: ParsedGeometry = {
      polylines,
      bboxWIn: safeNumber(width * scale),
      bboxHIn: safeNumber(height * scale),
      cutLengthIn: safeNumber(cutLengthIn),
      detectedUnits,
      entityCount: entities.length,
    };

    this.logger.log(
      `Parsed DXF: units ${detectedUnits}, ${result.entityCount} entities, ` +
        `${vertices} vertices, bbox ${result.bboxWIn.toFixed(3)} x ` +
        `${result.bboxHIn.toFixed(3)} in, cut length ` +
        `${result.cutLengthIn.toFixed(3)} in.`,
    );

    return result;
  }
}

/** Never hand NaN/Infinity to the quoting maths. */
function safeNumber(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

export { DxfParseError } from './dxf-types';
export type { ParsedGeometry } from './dxf-types';
