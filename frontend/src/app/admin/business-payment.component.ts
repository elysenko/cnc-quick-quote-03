import { ChangeDetectionStrategy, Component, OnDestroy, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, PaymentDocMasked } from '../core/api.service';

const SAVED_NOTE_MS = 2500;
const NOT_CONFIGURED = 'Not configured';

@Component({
  selector: 'app-business-payment',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './business-payment.component.html',
  styleUrls: ['./admin.css', './business.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BusinessPaymentComponent implements OnDestroy {
  private readonly api = inject(ApiService);

  readonly sandbox = signal(true);
  readonly publishableKey = signal('');

  /** Plaintext only ever travels admin → server; these inputs are cleared after a save. */
  readonly secretKey = signal('');
  readonly webhookSecret = signal('');

  /** GETs only ever return masked values — never plaintext. */
  readonly maskedSecret = signal('');
  readonly maskedWebhook = signal('');
  readonly saved = signal(false);

  private savedTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    void this.load();
  }

  ngOnDestroy(): void {
    if (this.savedTimer) clearTimeout(this.savedTimer);
  }

  private async load(): Promise<void> {
    try {
      this.applyDoc(await this.api.settingsDoc<PaymentDocMasked>('payment'));
    } catch {
      this.maskedSecret.set(NOT_CONFIGURED);
      this.maskedWebhook.set(NOT_CONFIGURED);
    }
  }

  private applyDoc(doc: PaymentDocMasked): void {
    this.sandbox.set(doc.sandbox);
    this.publishableKey.set(doc.publishableKey);
    this.maskedSecret.set(doc.stripeSecretKeyMasked || NOT_CONFIGURED);
    this.maskedWebhook.set(doc.stripeWebhookSecretMasked || NOT_CONFIGURED);
  }

  toggleSandbox(): void {
    this.sandbox.update((value) => !value);
  }

  /** An empty secret field means "leave the stored value alone" server-side. */
  async save(): Promise<void> {
    let doc: PaymentDocMasked;
    try {
      doc = await this.api.saveSettingsDoc<PaymentDocMasked>('payment', {
        sandbox: this.sandbox(),
        publishableKey: this.publishableKey(),
        stripeSecretKey: this.secretKey(),
        stripeWebhookSecret: this.webhookSecret(),
      });
    } catch {
      return;
    }

    this.secretKey.set('');
    this.webhookSecret.set('');
    this.applyDoc(doc);

    this.saved.set(true);
    if (this.savedTimer) clearTimeout(this.savedTimer);
    this.savedTimer = setTimeout(() => this.saved.set(false), SAVED_NOTE_MS);
  }
}
