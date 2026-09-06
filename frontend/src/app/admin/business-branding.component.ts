import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BrandingService } from '../core/branding.service';

@Component({
  selector: 'app-business-branding',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './business-branding.component.html',
  styleUrls: ['./admin.css', './business.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BusinessBrandingComponent {
  private readonly branding = inject(BrandingService);

  readonly companyName = signal(this.branding.branding().companyName);
  readonly tagline = signal(this.branding.branding().tagline);
  readonly initials = signal(this.branding.branding().logoInitials);
  readonly primary = signal(this.branding.branding().primaryColor);
  readonly accent = signal(this.branding.branding().accentColor);

  apply(): void {
    this.branding.update({
      companyName: this.companyName(),
      tagline: this.tagline(),
      logoInitials: this.initials(),
      primaryColor: this.primary(),
      accentColor: this.accent(),
    });
  }

  reset(): void {
    this.branding.reset();
    const current = this.branding.branding();
    this.companyName.set(current.companyName);
    this.tagline.set(current.tagline);
    this.initials.set(current.logoInitials);
    this.primary.set(current.primaryColor);
    this.accent.set(current.accentColor);
  }
}
