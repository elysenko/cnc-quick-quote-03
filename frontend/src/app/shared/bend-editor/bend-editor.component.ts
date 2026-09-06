import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  effect,
  input,
  model,
  signal,
  viewChild,
} from '@angular/core';
import { BendLine } from '../../core/models';
import { computeFit } from '../work-bed/renderer';

const HANDLE_HIT_PX = 14;
/** Mirrors the server's 0 <= angleDeg <= 180 constraint. */
const MIN_ANGLE = 0;
const MAX_ANGLE = 180;

interface DragState {
  bendId: string;
  endpoint: 1 | 2;
}

/**
 * Canvas overlay on the parsed part outline. Drag on empty space to create a bend
 * line; drag an endpoint handle to move it. Angle and direction are edited in the
 * side list with the same validation the API applies.
 */
@Component({
  selector: 'app-bend-editor',
  standalone: true,
  templateUrl: './bend-editor.component.html',
  styleUrl: './bend-editor.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BendEditorComponent implements AfterViewInit, OnDestroy {
  readonly polylines = input.required<number[][]>();
  readonly partWidthIn = input.required<number>();
  readonly partHeightIn = input.required<number>();

  /** Two-way: the wizard step owns the list, this component mutates it. */
  readonly bends = model.required<BendLine[]>();

  readonly errors = signal<Record<string, string>>({});

  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly stageRef = viewChild.required<ElementRef<HTMLDivElement>>('stage');

  /** viewChild.required() throws when read before the view exists, so the
   * constructor effect must not paint until ngAfterViewInit has run. */
  private readonly viewReady = signal(false);
  private observer: ResizeObserver | null = null;
  private drag: DragState | null = null;
  private nextId = 1;

  constructor() {
    effect(() => {
      this.bends();
      this.polylines();
      if (this.viewReady()) this.paint();
    });
  }

  ngAfterViewInit(): void {
    this.viewReady.set(true);
    this.observer = new ResizeObserver(() => {
      this.resize();
      this.paint();
    });
    this.observer.observe(this.stageRef().nativeElement);
    this.resize();
    this.paint();
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }

  // ---- interaction -------------------------------------------------------

  onPointerDown(event: PointerEvent): void {
    const point = this.toPart(event);
    const hit = this.hitHandle(point.x, point.y);
    if (hit) {
      this.drag = hit;
    } else {
      const id = `bend_new_${this.nextId++}`;
      this.bends.update((list) => [
        ...list,
        { id, x1: point.x, y1: point.y, x2: point.x, y2: point.y, angleDeg: 90, direction: 'up' },
      ]);
      this.drag = { bendId: id, endpoint: 2 };
    }
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
  }

  onPointerMove(event: PointerEvent): void {
    if (!this.drag) return;
    const point = this.toPart(event);
    const { bendId, endpoint } = this.drag;
    this.bends.update((list) =>
      list.map((bend) =>
        bend.id === bendId
          ? endpoint === 1
            ? { ...bend, x1: point.x, y1: point.y }
            : { ...bend, x2: point.x, y2: point.y }
          : bend,
      ),
    );
  }

  onPointerUp(event: PointerEvent): void {
    if (!this.drag) return;
    const { bendId } = this.drag;
    this.drag = null;
    (event.target as HTMLElement).releasePointerCapture?.(event.pointerId);
    // Discard accidental taps that never became a line.
    this.bends.update((list) =>
      list.filter((bend) => bend.id !== bendId || Math.hypot(bend.x2 - bend.x1, bend.y2 - bend.y1) > 0.2),
    );
  }

  setAngle(id: string, event: Event): void {
    const raw = Number((event.target as HTMLInputElement).value);
    if (!Number.isFinite(raw) || raw < MIN_ANGLE || raw > MAX_ANGLE) {
      this.errors.update((all) => ({ ...all, [id]: 'Angle must be between 0 and 180 degrees.' }));
      return;
    }
    this.errors.update((all) => {
      const next = { ...all };
      delete next[id];
      return next;
    });
    this.bends.update((list) =>
      list.map((bend) => (bend.id === id ? { ...bend, angleDeg: raw } : bend)),
    );
  }

  setDirection(id: string, direction: 'up' | 'down'): void {
    this.bends.update((list) =>
      list.map((bend) => (bend.id === id ? { ...bend, direction } : bend)),
    );
  }

  remove(id: string): void {
    this.bends.update((list) => list.filter((bend) => bend.id !== id));
  }

  // ---- geometry / drawing ------------------------------------------------

  private fit() {
    const canvas = this.canvasRef().nativeElement;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    return computeFit(
      this.partWidthIn(),
      this.partHeightIn(),
      canvas.width / dpr,
      canvas.height / dpr,
      28,
    );
  }

  private toPart(event: PointerEvent): { x: number; y: number } {
    const rect = this.canvasRef().nativeElement.getBoundingClientRect();
    const fit = this.fit();
    return {
      x: clamp((event.clientX - rect.left - fit.offsetX) / fit.scale, 0, this.partWidthIn()),
      y: clamp((event.clientY - rect.top - fit.offsetY) / fit.scale, 0, this.partHeightIn()),
    };
  }

  private hitHandle(x: number, y: number): DragState | null {
    const tolerance = HANDLE_HIT_PX / this.fit().scale;
    for (const bend of this.bends()) {
      if (Math.hypot(bend.x1 - x, bend.y1 - y) <= tolerance) return { bendId: bend.id, endpoint: 1 };
      if (Math.hypot(bend.x2 - x, bend.y2 - y) <= tolerance) return { bendId: bend.id, endpoint: 2 };
    }
    return null;
  }

  private resize(): void {
    const canvas = this.canvasRef().nativeElement;
    const stage = this.stageRef().nativeElement;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(Math.max(1, stage.clientWidth) * dpr);
    canvas.height = Math.round(Math.max(1, stage.clientHeight) * dpr);
  }

  private paint(): void {
    if (!this.viewReady()) return;
    const canvas = this.canvasRef().nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cssW = canvas.width / dpr;
    const cssH = canvas.height / dpr;
    const styles = getComputedStyle(canvas);
    const token = (name: string, fallback: string) =>
      styles.getPropertyValue(name).trim() || fallback;

    ctx.fillStyle = token('--machine-bed', '#111827');
    ctx.fillRect(0, 0, cssW, cssH);

    const fit = this.fit();
    const px = (v: number) => v * fit.scale;
    ctx.save();
    ctx.translate(fit.offsetX, fit.offsetY);

    // Part outline — blue solid, matching the work bed's cut-path convention.
    ctx.strokeStyle = token('--machine-cut', '#3b82f6');
    ctx.lineWidth = 1.8;
    for (const line of this.polylines()) {
      ctx.beginPath();
      for (let i = 0; i + 1 < line.length; i += 2) {
        const method = i === 0 ? 'moveTo' : 'lineTo';
        ctx[method](px(line[i]), px(line[i + 1]));
      }
      ctx.stroke();
    }

    // Bend lines — orange dashed with endpoint handles.
    const bendColor = token('--machine-bend', '#fb923c');
    ctx.font = '11px ui-monospace, monospace';
    for (const bend of this.bends()) {
      ctx.setLineDash([7, 5]);
      ctx.strokeStyle = bendColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px(bend.x1), px(bend.y1));
      ctx.lineTo(px(bend.x2), px(bend.y2));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = bendColor;
      for (const [hx, hy] of [
        [bend.x1, bend.y1],
        [bend.x2, bend.y2],
      ]) {
        ctx.beginPath();
        ctx.arc(px(hx), px(hy), 5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillText(
        `${bend.angleDeg}° ${bend.direction}`,
        px((bend.x1 + bend.x2) / 2) + 8,
        px((bend.y1 + bend.y2) / 2) - 8,
      );
    }
    ctx.restore();
  }
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
