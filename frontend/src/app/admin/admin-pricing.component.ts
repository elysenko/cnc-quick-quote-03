import { ChangeDetectionStrategy, Component, OnDestroy, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CostBreakdownComponent } from '../shared/cost-breakdown/cost-breakdown.component';
import { QuoteDraftService } from '../quote-wizard/quote-draft.service';
import { ApiService, PricingDoc, apiErrorMessage } from '../core/api.service';

const SAVED_NOTE_MS = 2500;

@Component({
  selector: 'app-admin-pricing',
  standalone: true,
  imports: [FormsModule, CostBreakdownComponent],
  templateUrl: './admin-pricing.component.html',
  styleUrl: './admin.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminPricingComponent implements OnDestroy {
  private readonly api = inject(ApiService);
  private readonly draft = inject(QuoteDraftService);

  /** Form values are dollars; the `pricing` document is integer cents. */
  readonly setupFee = signal(0);
  readonly costPerFoot = signal(0);
  readonly costPerBend = signal(0);
  readonly handlingFee = signal(0);
  readonly minimumOrder = signal(0);

  readonly saved = signal(false);
  readonly error = signal<string | null>(null);

  /**
   * The worked example is priced by the same shared draft service the wizard uses, so it
   * always reflects the *saved* rate card — never the admin's unsaved form values.
   */
  readonly preview = this.draft.breakdown;

  private savedTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    void this.load();
  }

  ngOnDestroy(): void {
    if (this.savedTimer) clearTimeout(this.savedTimer);
  }

  private async load(): Promise<void> {
    try {
      const doc = await this.api.settingsDoc<PricingDoc>('pricing');
      this.setupFee.set(doc.setupFeeCents / 100);
      this.costPerFoot.set(doc.costPerLinearFootCents / 100);
      this.costPerBend.set(doc.costPerBendCents / 100);
      this.handlingFee.set(doc.handlingFeeCents / 100);
      this.minimumOrder.set(doc.minimumOrderCents / 100);
      this.error.set(null);
    } catch (error) {
      this.error.set(apiErrorMessage(error, 'Could not load the current pricing. Reload to try again.'));
    }
  }

  /** Client-side mirror of the server's pricing constraints. */
  async save(): Promise<void> {
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

    const body: PricingDoc = {
      setupFeeCents: Math.round(this.setupFee() * 100),
      costPerLinearFootCents: Math.round(this.costPerFoot() * 100),
      costPerBendCents: Math.round(this.costPerBend() * 100),
      handlingFeeCents: Math.round(this.handlingFee() * 100),
      minimumOrderCents: Math.round(this.minimumOrder() * 100),
    };

    try {
      await this.api.saveSettingsDoc<PricingDoc>('pricing', body);
    } catch (error) {
      this.saved.set(false);
      this.error.set(apiErrorMessage(error, 'Pricing could not be saved. Try again.'));
      return;
    }

    this.error.set(null);
    // Re-pull the shared rate card so the worked example prices off what was just stored.
    await this.draft.loadConfig();
    this.saved.set(true);
    if (this.savedTimer) clearTimeout(this.savedTimer);
    this.savedTimer = setTimeout(() => this.saved.set(false), SAVED_NOTE_MS);
  }
}
