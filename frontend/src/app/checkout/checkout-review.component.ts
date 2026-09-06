import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { centsToUsd } from '../core/models';
import { ApiService } from '../core/api.service';

@Component({
  selector: 'app-checkout-review',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './checkout-review.component.html',
  styleUrl: './checkout.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckoutReviewComponent {
  readonly quoteId = input<string>('');

  private readonly api = inject(ApiService);

  readonly reference = signal('');
  readonly filename = signal('');
  readonly bendCount = signal(0);
  readonly materialName = signal('');
  readonly quantity = signal(0);
  readonly money = centsToUsd;

  private readonly sheets = signal(0);
  private readonly total = signal(0);

  constructor() {
    effect(() => {
      const id = this.quoteId();
      if (id) void this.load(id);
    });
  }

  private async load(id: string): Promise<void> {
    try {
      const review = await this.api.checkoutReview(id);
      this.reference.set(review.reference);
      this.filename.set(review.filename);
      this.bendCount.set(review.bendCount);
      this.materialName.set(review.materialName);
      this.quantity.set(review.quantity);
      this.sheets.set(review.sheetCount);
      this.total.set(review.totalCents);
    } catch {
      // The quote link is owner-scoped; an unreachable one simply renders as blank
      // rather than inventing figures the customer might act on.
    }
  }

  sheetCount(): number {
    return this.sheets();
  }

  totalCents(): number {
    return this.total();
  }
}
