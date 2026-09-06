import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BrandingService } from '../core/branding.service';
import { ApiService, BusinessDoc } from '../core/api.service';

@Component({
  selector: 'app-business-branding',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './business-branding.component.html',
  styleUrls: ['./admin.css', './business.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BusinessBrandingComponent {
  private readonly api = inject(ApiService);
  private readonly branding = inject(BrandingService);

  readonly companyName = signal('');
  readonly tagline = signal('');
  readonly initials = signal('');
  readonly primary = signal('#000000');
  readonly accent = signal('#000000');

  /** Serialises the writes: the template calls apply() on every keystroke. */
  private saving = false;
  private queued = false;

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      const doc = await this.api.settingsDoc<BusinessDoc>('business');
      this.fill(doc);
      this.pushToShell();
    } catch {
      // Fall back to whatever the shell already resolved for the public branding.
      const current = this.branding.branding();
      this.companyName.set(current.companyName);
      this.tagline.set(current.tagline);
      this.initials.set(current.logoInitials);
      this.primary.set(current.primaryColor);
      this.accent.set(current.accentColor);
    }
  }

  private fill(doc: BusinessDoc): void {
    this.companyName.set(doc.companyName);
    this.tagline.set(doc.tagline);
    this.initials.set(doc.logoInitials);
    this.primary.set(doc.primaryColor);
    this.accent.set(doc.accentColor);
  }

  private pushToShell(): void {
    this.branding.update({
      companyName: this.companyName(),
      tagline: this.tagline(),
      logoInitials: this.initials(),
      primaryColor: this.primary(),
      accentColor: this.accent(),
    });
  }

  /**
   * Restyles the shell immediately (the copy promises live colour feedback) and persists
   * the branding fields. Overlapping calls collapse into one trailing write, so holding
   * a key down never queues a request per character.
   */
  apply(): void {
    this.pushToShell();
    void this.persist();
  }

  private async persist(): Promise<void> {
    if (this.saving) {
      this.queued = true;
      return;
    }
    this.saving = true;
    try {
      do {
        this.queued = false;
        await this.api.saveSettingsDoc<BusinessDoc>('business', {
          companyName: this.companyName(),
          tagline: this.tagline(),
          logoInitials: this.initials(),
          primaryColor: this.primary(),
          accentColor: this.accent(),
        });
      } while (this.queued);
    } catch {
      // The shell keeps the previewed values; a reload shows what is actually stored.
    } finally {
      this.saving = false;
      this.queued = false;
    }
  }

  /** Discards unsaved edits by re-reading the stored document — never invents values. */
  async reset(): Promise<void> {
    try {
      const doc = await this.api.settingsDoc<BusinessDoc>('business');
      this.fill(doc);
      this.pushToShell();
    } catch {
      /* nothing authoritative to fall back to; leave the form as it is */
    }
  }
}
