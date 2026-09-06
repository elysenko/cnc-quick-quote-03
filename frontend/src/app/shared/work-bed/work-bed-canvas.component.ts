import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  computed,
  effect,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { BendLine, NestingResult } from '../../core/models';
import { LaserAnimation } from './laser-animation';
import {
  Segment,
  Theme,
  buildCutPath,
  computeFit,
  drawBed,
  drawBends,
  drawCuts,
  drawHead,
  drawLabel,
  drawSheet,
  totalLength,
} from './renderer';

@Component({
  selector: 'app-work-bed-canvas',
  standalone: true,
  templateUrl: './work-bed-canvas.component.html',
  styleUrl: './work-bed-canvas.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkBedCanvasComponent implements AfterViewInit, OnDestroy {
  readonly heading = input('Work bed');
  readonly bedWidthIn = input(60);
  readonly bedHeightIn = input(36);
  readonly nesting = input.required<NestingResult>();
  readonly polylines = input.required<number[][]>();
  readonly bends = input<BendLine[]>([]);
  readonly autoStart = input(true);

  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly wrapRef = viewChild.required<ElementRef<HTMLDivElement>>('wrap');

  readonly activeSheet = signal(0);
  readonly running = signal(false);

  readonly sheetIndexes = computed(() =>
    Array.from({ length: this.nesting().sheetCount }, (_, i) => i),
  );

  readonly cutLengthLabel = computed(() => {
    const inches = totalLength(this.segments());
    return `${inches.toFixed(1)}″ of cut path on this sheet`;
  });

  private readonly segments = computed<Segment[]>(() =>
    buildCutPath(this.polylines(), this.nesting(), this.activeSheet()),
  );

  private animation: LaserAnimation | null = null;
  private observer: ResizeObserver | null = null;
  private theme: Theme = FALLBACK_THEME;

  constructor() {
    // Re-arm the animation whenever the geometry or the selected sheet changes.
    effect(() => {
      const segments = this.segments();
      if (!this.animation) return;
      this.animation.configure(totalLength(segments));
      this.animation.redraw();
    });
  }

  ngAfterViewInit(): void {
    this.theme = readTheme(this.canvasRef().nativeElement);
    this.animation = new LaserAnimation((progress) => this.paint(progress));
    this.animation.configure(totalLength(this.segments()));

    this.observer = new ResizeObserver(() => {
      this.resize();
      this.animation?.redraw();
    });
    this.observer.observe(this.wrapRef().nativeElement);
    this.resize();

    if (this.autoStart() && this.nesting().placements.length) {
      this.animation.start();
      this.running.set(true);
    } else {
      this.animation.redraw();
    }
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    this.animation?.destroy();
  }

  /** Running -> stop and reset to the first frame. Stopped -> start. */
  togglePrint(): void {
    this.animation?.toggle();
    this.running.set(this.animation?.isRunning ?? false);
  }

  selectSheet(event: Event): void {
    this.activeSheet.set(Number((event.target as HTMLSelectElement).value) || 0);
  }

  /** Sizes the backing store to the CSS box so the fit transform never distorts. */
  private resize(): void {
    const canvas = this.canvasRef().nativeElement;
    const wrap = this.wrapRef().nativeElement;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.max(1, wrap.clientWidth);
    const height = Math.max(1, wrap.clientHeight);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext('2d');
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private paint(progressLength: number): void {
    const canvas = this.canvasRef().nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssW = canvas.width / dpr;
    const cssH = canvas.height / dpr;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const bedW = this.bedWidthIn();
    const bedH = this.bedHeightIn();
    const fit = computeFit(bedW, bedH, cssW, cssH);

    drawBed(ctx, fit, bedW, bedH, this.theme);
    drawSheet(ctx, fit, this.nesting(), this.theme);
    const head = drawCuts(ctx, fit, this.segments(), progressLength, this.theme);
    drawBends(ctx, fit, this.bends(), this.nesting(), this.activeSheet(), this.theme, true);
    if (head) drawHead(ctx, fit, head.headX, head.headY, this.theme);
    drawLabel(
      ctx,
      `sheet ${this.activeSheet() + 1}/${this.nesting().sheetCount}  ` +
        `${this.nesting().cols}×${this.nesting().rows} grid`,
      this.theme,
    );
    ctx.restore();
  }
}

const FALLBACK_THEME: Theme = {
  bed: '#111827',
  grid: '#1f2937',
  sheet: '#1e293b',
  sheetEdge: '#475569',
  cut: '#3b82f6',
  cutDone: '#60a5fa',
  cutPending: '#334155',
  bend: '#fb923c',
  head: '#f8fafc',
  headGlow: '#38bdf8',
  label: '#94a3b8',
};

/** Pulls the machine palette out of the design tokens so canvas matches the DOM. */
function readTheme(el: Element): Theme {
  if (typeof getComputedStyle === 'undefined') return FALLBACK_THEME;
  const styles = getComputedStyle(el);
  const token = (name: string, fallback: string) =>
    styles.getPropertyValue(name).trim() || fallback;
  return {
    bed: token('--machine-bed', FALLBACK_THEME.bed),
    grid: token('--machine-bed-grid', FALLBACK_THEME.grid),
    sheet: token('--machine-sheet', FALLBACK_THEME.sheet),
    sheetEdge: token('--machine-sheet-edge', FALLBACK_THEME.sheetEdge),
    cut: token('--machine-cut', FALLBACK_THEME.cut),
    cutDone: token('--machine-cut-done', FALLBACK_THEME.cutDone),
    cutPending: token('--machine-cut-pending', FALLBACK_THEME.cutPending),
    bend: token('--machine-bend', FALLBACK_THEME.bend),
    head: token('--machine-head', FALLBACK_THEME.head),
    headGlow: token('--machine-head-glow', FALLBACK_THEME.headGlow),
    label: token('--machine-label', FALLBACK_THEME.label),
  };
}
