import { ChangeDetectionStrategy, Component, OnDestroy, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, BusinessDoc } from '../core/api.service';

const SAVED_NOTE_MS = 2500;

@Component({
  selector: 'app-business-contact',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './business-contact.component.html',
  styleUrls: ['./admin.css', './business.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BusinessContactComponent implements OnDestroy {
  private readonly api = inject(ApiService);

  readonly email = signal('');
  readonly phone = signal('');
  readonly hours = signal('');
  readonly address = signal('');
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
      const doc = await this.api.settingsDoc<BusinessDoc>('business');
      this.email.set(doc.contactEmail);
      this.phone.set(doc.contactPhone);
      this.hours.set(doc.contactHours);
      this.address.set(doc.contactAddress);
    } catch {
      /* the fields stay blank until the document can be read */
    }
  }

  /** Merge-patches only the contact half of the business document. */
  async save(): Promise<void> {
    try {
      await this.api.saveSettingsDoc<BusinessDoc>('business', {
        contactEmail: this.email(),
        contactPhone: this.phone(),
        contactHours: this.hours(),
        contactAddress: this.address(),
      });
    } catch {
      return;
    }
    this.saved.set(true);
    if (this.savedTimer) clearTimeout(this.savedTimer);
    this.savedTimer = setTimeout(() => this.saved.set(false), SAVED_NOTE_MS);
  }
}
