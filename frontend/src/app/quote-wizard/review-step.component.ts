import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CostBreakdownComponent } from '../shared/cost-breakdown/cost-breakdown.component';
import { WorkBedCanvasComponent } from '../shared/work-bed/work-bed-canvas.component';
import { PART_POLYLINES } from '../core/mock-geometry';
import { QuoteDraftService } from './quote-draft.service';

@Component({
  selector: 'app-review-step',
  standalone: true,
  imports: [RouterLink, CostBreakdownComponent, WorkBedCanvasComponent],
  templateUrl: './review-step.component.html',
  styleUrl: './wizard-step.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReviewStepComponent {
  private readonly draft = inject(QuoteDraftService);
  private readonly router = inject(Router);

  readonly drawing = this.draft.drawing;
  readonly materialName = this.draft.materialName;
  readonly quantity = this.draft.quantity;
  readonly bends = this.draft.bends;
  readonly nesting = this.draft.nesting;
  readonly breakdown = this.draft.breakdown;
  readonly bedWidthIn = this.draft.bedWidthIn;
  readonly bedHeightIn = this.draft.bedHeightIn;

  readonly polylines = computed(() => this.drawing()?.polylines ?? PART_POLYLINES);

  generate(): void {
    void this.router.navigate(['/quotes', 'q_2418'], {
      queryParams: { panel: 'breakdown' },
    });
  }
}
