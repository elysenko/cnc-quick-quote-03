import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { QuoteDraftService } from '../quote-wizard/quote-draft.service';
import { centsToUsd } from '../core/models';

@Component({
  selector: 'app-checkout-review',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './checkout-review.component.html',
  styleUrl: './checkout.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckoutReviewComponent {
  readonly quoteId = input<string>('q_2418');

  private readonly draft = inject(QuoteDraftService);

  readonly reference = signal('Q-2026-2418');
  readonly filename = signal('mount-bracket-rev-c.dxf');
  readonly bendCount = signal(2);

  readonly materialName = this.draft.materialName;
  readonly quantity = this.draft.quantity;
  readonly money = centsToUsd;

  sheetCount(): number {
    return this.draft.nesting().sheetCount;
  }

  totalCents(): number {
    return this.draft.breakdown().totalCents;
  }
}
