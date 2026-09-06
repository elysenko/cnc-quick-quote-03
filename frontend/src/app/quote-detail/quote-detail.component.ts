import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { SlicePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { CostBreakdownComponent } from '../shared/cost-breakdown/cost-breakdown.component';
import { WorkBedCanvasComponent } from '../shared/work-bed/work-bed-canvas.component';
import { ModalComponent } from '../shared/modal/modal.component';
import { QueryParamStateService } from '../core/query-param-state.service';
import { QuoteDraftService } from '../quote-wizard/quote-draft.service';
import { PART_POLYLINES } from '../core/mock-geometry';
import { Quote, centsToUsd } from '../core/models';

const PANELS = ['breakdown', 'nesting'] as const;
type Panel = (typeof PANELS)[number];

@Component({
  selector: 'app-quote-detail',
  standalone: true,
  imports: [RouterLink, SlicePipe, CostBreakdownComponent, WorkBedCanvasComponent, ModalComponent],
  templateUrl: './quote-detail.component.html',
  styleUrl: './quote-detail.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuoteDetailComponent {
  /** Bound from the route param via withComponentInputBinding(). */
  readonly id = input<string>('q_2418');

  private readonly params = inject(QueryParamStateService);
  private readonly router = inject(Router);
  private readonly draft = inject(QuoteDraftService);

  readonly quotes = signal<Quote[]>([
    { id: 'q_2418', reference: 'Q-2026-2418', materialId: 'mat_ss304_16', materialName: 'Stainless 304 — 16 ga', filename: 'mount-bracket-rev-c.dxf', quantity: 24, cutLengthIn: 42.6, bendCount: 2, sheetCount: 2, utilization: 0.71, totalCents: 41_866, status: 'ready', createdAt: '2026-09-04T14:22:00Z' },
    { id: 'q_2417', reference: 'Q-2026-2417', materialId: 'mat_ms_14', materialName: 'Mild steel — 14 ga', filename: 'gusset-plate.dxf', quantity: 120, cutLengthIn: 18.4, bendCount: 0, sheetCount: 3, utilization: 0.88, totalCents: 62_140, status: 'ordered', createdAt: '2026-09-03T09:05:00Z' },
    { id: 'q_2416', reference: 'Q-2026-2416', materialId: 'mat_al5052_125', materialName: 'Aluminium 5052 — 0.125"', filename: 'enclosure-lid.dxf', quantity: 8, cutLengthIn: 96.2, bendCount: 4, sheetCount: 2, utilization: 0.42, totalCents: 38_910, status: 'ready', createdAt: '2026-09-02T16:40:00Z' },
  ]);

  /** Any unknown id still renders a populated screen, so deep links never dead-end. */
  readonly quote = computed(
    () => this.quotes().find((q) => q.id === this.id()) ?? this.quotes()[0],
  );

  readonly panel = this.params.read<Panel>('panel', 'breakdown', PANELS);
  readonly modal = this.params.read<string>('modal', '');

  readonly breakdown = this.draft.breakdown;
  readonly nesting = this.draft.nesting;
  readonly bends = this.draft.bends;
  readonly bedWidthIn = this.draft.bedWidthIn;
  readonly bedHeightIn = this.draft.bedHeightIn;
  readonly polylines = computed(() => this.draft.drawing()?.polylines ?? PART_POLYLINES);
  readonly money = centsToUsd;

  statusClass(): string {
    const status = this.quote().status;
    if (status === 'ordered') return 'badge--success';
    if (status === 'ready') return 'badge--info';
    if (status === 'expired') return 'badge--danger';
    return '';
  }

  openConfirm(): void {
    this.params.patch({ modal: 'confirm-order' });
  }

  closeModal(): void {
    this.params.patch({ modal: null });
  }

  toCheckout(): void {
    void this.router.navigate(['/checkout', this.quote().id, 'review']);
  }
}
