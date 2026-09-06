import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { QuoteDraftService } from '../quote-wizard/quote-draft.service';

@Component({
  selector: 'app-admin-machine',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './admin-machine.component.html',
  styleUrl: './admin.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminMachineComponent {
  private readonly draft = inject(QuoteDraftService);

  readonly bedWidth = signal(this.draft.bedWidthIn());
  readonly bedHeight = signal(this.draft.bedHeightIn());
  readonly margin = signal(this.draft.marginIn());
  readonly spacing = signal(this.draft.spacingIn());
  readonly quantityMin = signal(1);
  readonly quantityMax = signal(500);
  readonly maxUploadMb = signal(12);
  readonly extensions = signal('.dxf');

  readonly saved = signal(false);
  readonly error = signal<string | null>(null);

  save(): void {
    if (this.quantityMin() < 1 || this.quantityMax() <= this.quantityMin()) {
      this.error.set('Maximum quantity must be greater than the minimum, and the minimum at least 1.');
      this.saved.set(false);
      return;
    }
    if (this.bedWidth() <= 0 || this.bedHeight() <= 0 || this.margin() < 0 || this.spacing() < 0) {
      this.error.set('Bed dimensions must be positive; margin and spacing cannot be negative.');
      this.saved.set(false);
      return;
    }
    this.error.set(null);
    this.draft.bedWidthIn.set(this.bedWidth());
    this.draft.bedHeightIn.set(this.bedHeight());
    this.draft.marginIn.set(this.margin());
    this.draft.spacingIn.set(this.spacing());
    this.saved.set(true);
    setTimeout(() => this.saved.set(false), 2500);
  }
}
