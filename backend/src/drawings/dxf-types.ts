/**
 * Shared types for the hand-written ASCII DXF parser.
 *
 * No third-party DXF dependency is used: the tokenizer, entity extractor and
 * arc flattener are all implemented in `dxf-tokenizer.ts` / `dxf-flatten.ts`
 * and tied together by `dxf-parser.service.ts`.
 */

/**
 * Raised when a drawing cannot be parsed. The `message` is shown to the shop
 * operator verbatim (HTTP 422), so keep every message plain-English and
 * actionable.
 */
export class DxfParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DxfParseError';
    // Required so `instanceof` keeps working when compiled down to ES5-ish
    // targets by ts-jest / tsc.
    Object.setPrototypeOf(this, DxfParseError.prototype);
  }
}

export interface ParsedGeometry {
  /** Flattened polylines in INCHES, part-local coordinates: the minimum corner of
   *  the drawing bounding box is translated to (0,0). Each entry is a flat array
   *  [x0,y0,x1,y1,...] of consecutive vertices forming a polyline. */
  polylines: number[][];
  bboxWIn: number;
  bboxHIn: number;
  cutLengthIn: number;
  /** Human-readable, e.g. 'mm ($INSUNITS = 4)' or 'in ($INSUNITS = 1)' or
   *  'mm (default, $INSUNITS absent)' */
  detectedUnits: string;
  entityCount: number;
}

/** One raw group-code / value pair from the DXF stream. */
export interface DxfToken {
  code: number;
  value: string;
}

/** A raw entity record: its 0-code type name plus every group pair that
 *  belongs to it, in file order (order matters for LWPOLYLINE vertices). */
export interface RawEntity {
  type: string;
  pairs: DxfToken[];
  /** Only populated for old-style POLYLINE: the trailing VERTEX records. */
  children?: RawEntity[];
}

export interface LineEntity {
  type: 'LINE';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface CircleEntity {
  type: 'CIRCLE';
  cx: number;
  cy: number;
  r: number;
}

export interface ArcEntity {
  type: 'ARC';
  cx: number;
  cy: number;
  r: number;
  /** Degrees, counter-clockwise from +X. */
  startDeg: number;
  endDeg: number;
}

export interface PolyVertex {
  x: number;
  y: number;
  /** tan(includedAngle / 4); 0 means a straight segment to the next vertex. */
  bulge: number;
}

export interface PolylineEntity {
  type: 'POLYLINE';
  vertices: PolyVertex[];
  closed: boolean;
}

export type DxfEntity =
  | LineEntity
  | CircleEntity
  | ArcEntity
  | PolylineEntity;

/** Axis-aligned bounds accumulator, in drawing units. */
export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export const SUPPORTED_ENTITY_TYPES = [
  'LINE',
  'CIRCLE',
  'ARC',
  'LWPOLYLINE',
  'POLYLINE',
] as const;
