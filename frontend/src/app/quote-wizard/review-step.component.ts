import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CostBreakdownComponent } from '../shared/cost-breakdown/cost-breakdown.component';
import { WorkBedCanvasComponent } from '../shared/work-bed/work-bed-canvas.component';
import { QuoteDraftService } from './quote-draft.service';
import { ApiService, apiErrorMessage } from '../core/api.service';

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
  private readonly api = inject(ApiService);

  readonly drawing = this.draft.drawing;
  readonly materialName = this.draft.materialName;
  readonly quantity = this.draft.quantity;
  readonly bends = this.draft.bends;
  readonly nesting = this.draft.nesting;
  readonly breakdown = this.draft.breakdown;
  readonly bedWidthIn = this.draft.bedWidthIn;
  readonly bedHeightIn = this.draft.bedHeightIn;

  readonly polylines = computed(() => this.drawing()?.polylines ?? []);
  readonly generating = signal(false);
  readonly generateError = signal<string | null>(null);

  /**
   * The server re-nests and re-prices from its own settings and freezes the result
   * onto the row — this preview is only ever a preview.
   */
  generate(): void {
    if (this.generating()) return;
    const drawing = this.drawing();
    const materialId = this.draft.materialId();
    if (!drawing) {
      this.generateError.set('Upload a drawing before generating a quote.');
      void this.router.navigate(['/quote/new/upload']);
      return;
    }
    if (!materialId) {
      this.generateError.set('Choose a material before generating a quote.');
      void this.router.navigate(['/quote/new/material']);
      return;
    }

    this.generating.set(true);
    this.generateError.set(null);
    void this.api
      .createQuote(drawing.id, materialId, this.quantity())
      .then((quote) => {
        this.draft.reset();
        void this.router.navigate(['/quotes', quote.id], {
          queryParams: { panel: 'breakdown' },
        });
      })
      .catch((error: unknown) =>
        this.generateError.set(apiErrorMessage(error, 'That quote could not be generated.')),
      )
      .finally(() => this.generating.set(false));
  }
}
