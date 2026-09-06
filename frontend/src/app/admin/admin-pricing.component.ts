import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CostBreakdownComponent } from '../shared/cost-breakdown/cost-breakdown.component';
import { QuoteDraftService } from '../quote-wizard/quote-draft.service';

@Component({
  selector: 'app-admin-pricing',
  standalone: true,
  imports: [FormsModule, CostBreakdownComponent],
  templateUrl: './admin-pricing.component.html',
  styleUrl: './admin.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminPricingComponent {
  private readonly draft = inject(QuoteDraftService);

  readonly setupFee = signal(this.draft.setupFeeCents() / 100);
  readonly costPerFoot = signal(this.draft.costPerLinearFootCents() / 100);
  readonly costPerBend = signal(this.draft.costPerBendCents() / 100);
  readonly handlingFee = signal(this.draft.handlingFeeCents() / 100);
  readonly minimumOrder = signal(this.draft.minimumOrderCents() / 100);

  readonly saved = signal(false);
  readonly error = signal<string | null>(null);
  readonly preview = this.draft.breakdown;

  /** Client-side mirror of the server's pricing constraints. */
  save(): void {
    const values = [
      this.setupFee(),
      this.costPerFoot(),
      this.costPerBend(),
      this.handlingFee(),
      this.minimumOrder(),
    ];
    if (values.some((value) => !Number.isFinite(value) || value < 0)) {
      this.error.set('Every rate must be zero or greater.');
      this.saved.set(false);
      return;
    }
    this.error.set(null);
    // Push into the shared config so the worked example re-prices live.
    this.draft.setupFeeCents.set(Math.round(this.setupFee() * 100));
    this.draft.costPerLinearFootCents.set(Math.round(this.costPerFoot() * 100));
    this.draft.costPerBendCents.set(Math.round(this.costPerBend() * 100));
    this.draft.handlingFeeCents.set(Math.round(this.handlingFee() * 100));
    this.draft.minimumOrderCents.set(Math.round(this.minimumOrder() * 100));
    this.saved.set(true);
    setTimeout(() => this.saved.set(false), 2500);
  }
}
