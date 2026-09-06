import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { QueryParamStateService } from '../core/query-param-state.service';
import { QuoteDraftService } from '../quote-wizard/quote-draft.service';
import { ShippingMethod, centsToUsd } from '../core/models';

@Component({
  selector: 'app-checkout-shipping',
  standalone: true,
  imports: [RouterLink, FormsModule],
  templateUrl: './checkout-shipping.component.html',
  styleUrl: './checkout.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckoutShippingComponent {
  readonly quoteId = input<string>('q_2418');

  private readonly draft = inject(QuoteDraftService);
  private readonly router = inject(Router);
  private readonly params = inject(QueryParamStateService);

  /**
   * The server answers 409 when no method is active. That contact-us state is a design
   * the reviewer has to judge, so it gets a URL: ?methods=none.
   */
  private readonly methodsParam = this.params.read<'all' | 'none'>('methods', 'all', ['all', 'none']);

  private readonly allMethods = signal<ShippingMethod[]>([
    { id: 'ship_pickup', name: 'Shop pickup', description: 'Ready in 3 business days', baseRateCents: 0, perSheetRateCents: 0, active: true, sortOrder: 1 },
    { id: 'ship_ground', name: 'Ground freight', description: 'Delivered in 4–6 business days', baseRateCents: 1_850, perSheetRateCents: 420, active: true, sortOrder: 2 },
    { id: 'ship_express', name: 'Express 2-day', description: 'Delivered in 2 business days', baseRateCents: 4_900, perSheetRateCents: 950, active: true, sortOrder: 3 },
  ]);

  readonly methods = computed(() => (this.methodsParam() === 'none' ? [] : this.allMethods()));

  readonly recipient = signal('');
  readonly line1 = signal('');
  readonly city = signal('');
  readonly state = signal('');
  readonly zip = signal('');

  readonly selectedId = signal('ship_ground');
  readonly paying = signal(false);
  readonly payError = signal<string | null>(null);
  readonly money = centsToUsd;

  readonly sheetCount = computed(() => this.draft.nesting().sheetCount);
  readonly subtotalCents = computed(() => this.draft.breakdown().totalCents);

  readonly shippingCents = computed(() => {
    const method = this.methods().find((m) => m.id === this.selectedId());
    return method ? this.rateFor(method) : 0;
  });

  rateFor(method: ShippingMethod): number {
    return method.baseRateCents + method.perSheetRateCents * this.sheetCount();
  }

  /** Stands in for checkout.createSession → redirect to the Stripe-hosted page. */
  pay(): void {
    this.payError.set(null);
    this.paying.set(true);
    setTimeout(() => {
      this.paying.set(false);
      void this.router.navigate(['/order/confirmation', 'ord_9f21']);
    }, 700);
  }
}
