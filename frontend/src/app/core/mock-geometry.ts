/**
 * Flattened part geometry, in inches, part-local coordinates.
 *
 * Stands in for what the DXF parser returns (`polylines` on the Drawing response):
 * every curve already flattened to line segments so the renderer and the laser
 * animation can walk one flat vertex array.
 */

/** A mounting bracket: rounded rectangle outline, slot, and two bolt holes. */
function roundedRect(w: number, h: number, r: number, steps = 6): number[] {
  const pts: number[] = [];
  const corner = (cx: number, cy: number, from: number) => {
    for (let i = 0; i <= steps; i++) {
      const a = from + (Math.PI / 2) * (i / steps);
      pts.push(cx + r * Math.cos(a), cy + r * Math.sin(a));
    }
  };
  corner(w - r, h - r, 0);
  corner(r, h - r, Math.PI / 2);
  corner(r, r, Math.PI);
  corner(w - r, r, (3 * Math.PI) / 2);
  pts.push(pts[0], pts[1]);
  return pts;
}

function circle(cx: number, cy: number, r: number, steps = 24): number[] {
  const pts: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (Math.PI * 2 * i) / steps;
    pts.push(cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
  return pts;
}

export const PART_WIDTH_IN = 8.75;
export const PART_HEIGHT_IN = 5.5;

export const PART_POLYLINES: number[][] = [
  roundedRect(PART_WIDTH_IN, PART_HEIGHT_IN, 0.5),
  circle(1.35, 1.35, 0.34),
  circle(1.35, PART_HEIGHT_IN - 1.35, 0.34),
  circle(PART_WIDTH_IN - 1.35, 1.35, 0.34),
  circle(PART_WIDTH_IN - 1.35, PART_HEIGHT_IN - 1.35, 0.34),
  // Central relief slot
  [3.4, 2.15, 5.35, 2.15, 5.35, 3.35, 3.4, 3.35, 3.4, 2.15],
];

/** Per-part cut length in inches, matching the geometry above. */
export const PART_CUT_LENGTH_IN = 42.6;
