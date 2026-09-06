import { BendLine, NestingResult } from '../../core/models';

export interface FitTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  length: number;
}

export interface Theme {
  bed: string;
  grid: string;
  sheet: string;
  sheetEdge: string;
  cut: string;
  cutDone: string;
  cutPending: string;
  bend: string;
  head: string;
  headGlow: string;
  label: string;
}

/** Total rendered vertices are capped so a very dense part cannot stall the loop. */
export const MAX_VERTICES = 6000;

/**
 * Fit-to-viewport transform, recomputed on every resize so geometry is never
 * clipped or distorted regardless of the canvas aspect ratio.
 */
export function computeFit(
  contentW: number,
  contentH: number,
  canvasW: number,
  canvasH: number,
  pad = 22,
): FitTransform {
  const availW = Math.max(1, canvasW - pad * 2);
  const availH = Math.max(1, canvasH - pad * 2);
  const scale = Math.min(availW / contentW, availH / contentH);
  return {
    scale,
    offsetX: (canvasW - contentW * scale) / 2,
    offsetY: (canvasH - contentH * scale) / 2,
  };
}

/** Flattens every placed part's polylines into one ordered segment list. */
export function buildCutPath(
  polylines: number[][],
  nesting: NestingResult,
  sheetIndex: number,
): Segment[] {
  const segments: Segment[] = [];
  let vertices = 0;
  const placements = nesting.placements.filter((p) => p.sheet === sheetIndex);
  for (const placement of placements) {
    for (const line of polylines) {
      for (let i = 0; i + 3 < line.length; i += 2) {
        if (vertices > MAX_VERTICES) return segments;
        const x1 = placement.x + line[i];
        const y1 = placement.y + line[i + 1];
        const x2 = placement.x + line[i + 2];
        const y2 = placement.y + line[i + 3];
        segments.push({ x1, y1, x2, y2, length: Math.hypot(x2 - x1, y2 - y1) });
        vertices++;
      }
    }
  }
  return segments;
}

export function totalLength(segments: Segment[]): number {
  return segments.reduce((sum, s) => sum + s.length, 0);
}

export function drawBed(
  ctx: CanvasRenderingContext2D,
  fit: FitTransform,
  bedW: number,
  bedH: number,
  theme: Theme,
): void {
  ctx.fillStyle = theme.bed;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  const px = (v: number) => v * fit.scale;
  ctx.save();
  ctx.translate(fit.offsetX, fit.offsetY);

  ctx.strokeStyle = theme.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= bedW; x += 6) {
    ctx.moveTo(px(x), 0);
    ctx.lineTo(px(x), px(bedH));
  }
  for (let y = 0; y <= bedH; y += 6) {
    ctx.moveTo(0, px(y));
    ctx.lineTo(px(bedW), px(y));
  }
  ctx.stroke();

  ctx.strokeStyle = theme.sheetEdge;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(0, 0, px(bedW), px(bedH));
  ctx.restore();
}

export function drawSheet(
  ctx: CanvasRenderingContext2D,
  fit: FitTransform,
  nesting: NestingResult,
  theme: Theme,
): void {
  const px = (v: number) => v * fit.scale;
  ctx.save();
  ctx.translate(fit.offsetX, fit.offsetY);
  ctx.fillStyle = theme.sheet;
  ctx.fillRect(0, 0, px(nesting.sheetWidthIn), px(nesting.sheetHeightIn));
  ctx.setLineDash([6, 5]);
  ctx.strokeStyle = theme.sheetEdge;
  ctx.lineWidth = 1;
  ctx.strokeRect(
    px(nesting.marginIn),
    px(nesting.marginIn),
    px(nesting.sheetWidthIn - nesting.marginIn * 2),
    px(nesting.sheetHeightIn - nesting.marginIn * 2),
  );
  ctx.setLineDash([]);
  ctx.restore();
}

/** Cut paths: blue solid. Completed / active / pending are coloured separately. */
export function drawCuts(
  ctx: CanvasRenderingContext2D,
  fit: FitTransform,
  segments: Segment[],
  progressLength: number,
  theme: Theme,
): { headX: number; headY: number } | null {
  const px = (v: number) => v * fit.scale;
  ctx.save();
  ctx.translate(fit.offsetX, fit.offsetY);
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';

  let walked = 0;
  let head: { headX: number; headY: number } | null = null;

  for (const seg of segments) {
    const start = walked;
    const end = walked + seg.length;
    walked = end;

    if (progressLength >= end) {
      ctx.strokeStyle = theme.cutDone;
    } else if (progressLength <= start) {
      ctx.strokeStyle = theme.cutPending;
    } else {
      const t = (progressLength - start) / (seg.length || 1);
      const mx = seg.x1 + (seg.x2 - seg.x1) * t;
      const my = seg.y1 + (seg.y2 - seg.y1) * t;
      ctx.strokeStyle = theme.cutDone;
      ctx.beginPath();
      ctx.moveTo(px(seg.x1), px(seg.y1));
      ctx.lineTo(px(mx), px(my));
      ctx.stroke();
      ctx.strokeStyle = theme.cut;
      ctx.beginPath();
      ctx.moveTo(px(mx), px(my));
      ctx.lineTo(px(seg.x2), px(seg.y2));
      ctx.stroke();
      head = { headX: mx, headY: my };
      continue;
    }

    ctx.beginPath();
    ctx.moveTo(px(seg.x1), px(seg.y1));
    ctx.lineTo(px(seg.x2), px(seg.y2));
    ctx.stroke();
  }
  ctx.restore();
  return head;
}

/** Bend lines: orange dashed, with an angle/direction label. */
export function drawBends(
  ctx: CanvasRenderingContext2D,
  fit: FitTransform,
  bends: BendLine[],
  nesting: NestingResult,
  sheetIndex: number,
  theme: Theme,
  withLabels: boolean,
): void {
  if (!bends.length) return;
  const px = (v: number) => v * fit.scale;
  const placements = nesting.placements.filter((p) => p.sheet === sheetIndex);
  ctx.save();
  ctx.translate(fit.offsetX, fit.offsetY);
  ctx.setLineDash([7, 5]);
  ctx.strokeStyle = theme.bend;
  ctx.lineWidth = 1.8;
  ctx.font = '11px ui-monospace, monospace';
  ctx.fillStyle = theme.bend;

  for (const placement of placements) {
    for (const bend of bends) {
      ctx.beginPath();
      ctx.moveTo(px(placement.x + bend.x1), px(placement.y + bend.y1));
      ctx.lineTo(px(placement.x + bend.x2), px(placement.y + bend.y2));
      ctx.stroke();
    }
  }
  if (withLabels && placements.length) {
    const first = placements[0];
    ctx.setLineDash([]);
    for (const bend of bends) {
      const mx = px(first.x + (bend.x1 + bend.x2) / 2);
      const my = px(first.y + (bend.y1 + bend.y2) / 2);
      ctx.fillText(`${bend.angleDeg}° ${bend.direction}`, mx + 6, my - 6);
    }
  }
  ctx.restore();
}

export function drawHead(
  ctx: CanvasRenderingContext2D,
  fit: FitTransform,
  x: number,
  y: number,
  theme: Theme,
): void {
  const cx = fit.offsetX + x * fit.scale;
  const cy = fit.offsetY + y * fit.scale;
  ctx.save();
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 16);
  glow.addColorStop(0, theme.headGlow);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = 0.65;
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = theme.head;
  ctx.beginPath();
  ctx.arc(cx, cy, 3.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  theme: Theme,
): void {
  ctx.save();
  ctx.font = '11px ui-monospace, monospace';
  ctx.fillStyle = theme.label;
  ctx.fillText(text, 12, ctx.canvas.height - 12);
  ctx.restore();
}
