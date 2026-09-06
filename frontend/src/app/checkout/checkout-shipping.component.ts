import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ShippingOption, centsToUsd } from '../core/models';
import { ApiService, apiErrorMessage, apiErrorStatus } from '../core/api.service';

@Component({
  selector: 'app-checkout-shipping',
  standalone: true,
  imports: [RouterLink, FormsModule],
  templateUrl: './checkout-shipping.component.html',
  styleUrl: './checkout.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckoutShippingComponent {
  readonly quoteId = input<string>('');

  private readonly api = inject(ApiService);

  /** Empty means the shop has no active delivery option — the template shows contact-us. */
  readonly methods = signal<ShippingOption[]>([]);

  readonly recipient = signal('');
  readonly line1 = signal('');
  readonly city = signal('');
  readonly state = signal('');
  readonly zip = signal('');

  readonly selectedId = signal('');
  readonly paying = signal(false);
  readonly payError = signal<string | null>(null);
  readonly money = centsToUsd;

  private readonly sheets = signal(0);
  private readonly subtotal = signal(0);

  readonly sheetCount = computed(() => this.sheets());
  readonly subtotalCents = computed(() => this.subtotal());

  readonly shippingCents = computed(() => {
    const method = this.methods().find((option) => option.id === this.selectedId());
    return method ? this.rateFor(method) : 0;
  });

  constructor() {
    effect(() => {
      const id = this.quoteId();
      if (id) void this.load(id);
    });
  }

  private async load(id: string): Promise<void> {
    try {
      const review = await this.api.checkoutReview(id);
      this.sheets.set(review.sheetCount);
      this.subtotal.set(review.totalCents);
    } catch {
      /* the totals row simply stays at zero */
    }
    try {
      const options = await this.api.shippingOptions(id);
      this.methods.set(options);
      if (options.length > 0 && !options.some((option) => option.id === this.selectedId())) {
        this.selectedId.set(options[0].id);
      }
    } catch (error) {
      // 409 is the documented "no active methods" answer, and the template already
      // renders that as a contact-us state driven by an empty list.
      this.methods.set([]);
      if (apiErrorStatus(error) !== 409) {
        this.payError.set(apiErrorMessage(error, 'Delivery options could not be loaded.'));
      }
    }
  }

  /** Per-sheet rates resolve against this quote's sheet count. */
  rateFor(method: ShippingOption): number {
    return method.baseRateCents + method.perSheetRateCents * this.sheetCount();
  }

  /** Creates the Stripe Checkout Session and hands the browser to Stripe's page. */
  pay(): void {
    if (this.paying()) return;
    const id = this.quoteId();
    const shippingMethodId = this.selectedId();
    if (!id || !shippingMethodId) {
      this.payError.set('Choose a delivery option to continue.');
      return;
    }
    if (!this.recipient().trim() || !this.line1().trim() || !this.city().trim() || !this.zip().trim()) {
      this.payError.set('Enter the delivery name and address before paying.');
      return;
    }

    this.payError.set(null);
    this.paying.set(true);
    void this.api
      .createCheckoutSession(id, {
        shippingMethodId,
        recipient: this.recipient(),
        line1: this.line1(),
        city: this.city(),
        state: this.state(),
        zip: this.zip(),
      })
      .then((session) => {
        // Full navigation, not a router hop — Stripe hosts the payment page.
        window.location.assign(session.url);
      })
      .catch((error: unknown) => {
        this.paying.set(false);
        this.payError.set(
          apiErrorMessage(
            error,
            'Card payment is unavailable right now. Nothing was charged — please try again shortly.',
          ),
        );
      });
  }
}
