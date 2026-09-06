import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { SlicePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { CostBreakdownComponent } from '../shared/cost-breakdown/cost-breakdown.component';
import { WorkBedCanvasComponent } from '../shared/work-bed/work-bed-canvas.component';
import { ModalComponent } from '../shared/modal/modal.component';
import { QueryParamStateService } from '../core/query-param-state.service';
import { QuoteDetail, centsToUsd } from '../core/models';

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
  /**
   * Bound from the route's `detail` resolver via withComponentInputBinding(), so the
   * component is only ever constructed with a loaded quote — the template has no
   * loading branch and dereferences `quote()` on its first line.
   */
  readonly detail = input.required<QuoteDetail>();

  private readonly params = inject(QueryParamStateService);
  private readonly router = inject(Router);

  readonly quote = computed(() => this.detail());

  readonly panel = this.params.read<Panel>('panel', 'breakdown', PANELS);
  readonly modal = this.params.read<string>('modal', '');

  /**
   * Geometry and pricing come off the loaded quote, never off the wizard draft: a quote
   * detail page must show the price frozen onto that quote, not a live recomputation.
   */
  readonly breakdown = computed(() => this.detail().breakdown);
  readonly nesting = computed(() => this.detail().nesting);
  readonly bends = computed(() => this.detail().bends);
  readonly polylines = computed(() => this.detail().polylines);
  readonly bedWidthIn = computed(() => this.detail().bedWidthIn);
  readonly bedHeightIn = computed(() => this.detail().bedHeightIn);
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
