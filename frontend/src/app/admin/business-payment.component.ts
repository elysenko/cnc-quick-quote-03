import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-business-payment',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './business-payment.component.html',
  styleUrls: ['./admin.css', './business.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BusinessPaymentComponent {
  readonly sandbox = signal(true);
  readonly secretKey = signal('');
  readonly webhookSecret = signal('');
  readonly publishableKey = signal('pk_test_51QeXampleOnlyNotARealKey');

  /** GETs only ever return masked values — never plaintext. */
  readonly maskedSecret = signal('sk_test_••••••••••••4c9f');
  readonly maskedWebhook = signal('whsec_••••••••2b17');
  readonly saved = signal(false);

  toggleSandbox(): void {
    this.sandbox.update((value) => !value);
  }

  save(): void {
    this.saved.set(true);
    this.secretKey.set('');
    this.webhookSecret.set('');
    setTimeout(() => this.saved.set(false), 2500);
  }
}
