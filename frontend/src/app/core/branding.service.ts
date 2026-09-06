import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';

export interface PublicBusiness {
  companyName: string;
  tagline: string;
  logoInitials: string;
  primaryColor: string;
  accentColor: string;
}

const DEFAULTS: PublicBusiness = {
  companyName: 'Fieldworks Fabrication',
  tagline: 'CNC laser cutting, quoted instantly',
  logoInitials: 'FF',
  primaryColor: '#1d4ed8',
  accentColor: '#ea580c',
};

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/**
 * Public branding (company name, logo, primary/accent colors) applied as CSS custom
 * properties on the document root. Safe defaults are applied synchronously so first
 * paint is never blocked or unstyled while the fetch resolves.
 */
@Injectable({ providedIn: 'root' })
export class BrandingService {
  readonly branding = signal<PublicBusiness>(DEFAULTS);

  private readonly api = inject(ApiService);

  constructor() {
    // Defaults paint immediately; the fetch only refines them, so first paint is
    // never blocked and a branding outage never blanks the shell.
    this.apply(this.branding());
    void this.refresh();
  }

  /** Failure-tolerant: an unreachable API leaves the defaults in place. */
  async refresh(): Promise<void> {
    try {
      const business = await this.api.publicBusiness();
      this.update({
        ...(business.companyName ? { companyName: business.companyName } : {}),
        ...(business.tagline ? { tagline: business.tagline } : {}),
        ...(business.logoInitials ? { logoInitials: business.logoInitials } : {}),
        ...(business.primaryColor ? { primaryColor: business.primaryColor } : {}),
        ...(business.accentColor ? { accentColor: business.accentColor } : {}),
      });
    } catch {
      /* keep defaults */
    }
  }

  update(patch: Partial<PublicBusiness>): void {
    const next = { ...this.branding(), ...patch };
    this.branding.set(next);
    this.apply(next);
  }

  reset(): void {
    this.branding.set(DEFAULTS);
    this.apply(DEFAULTS);
  }

  private apply(value: PublicBusiness): void {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (HEX_RE.test(value.primaryColor)) {
      root.style.setProperty('--brand-primary', value.primaryColor);
      root.style.setProperty('--brand-primary-strong', shade(value.primaryColor, -0.18));
      root.style.setProperty('--brand-primary-soft', shade(value.primaryColor, 0.92));
      root.style.setProperty('--brand-primary-border', shade(value.primaryColor, 0.68));
    }
    if (HEX_RE.test(value.accentColor)) {
      root.style.setProperty('--brand-accent', value.accentColor);
      root.style.setProperty('--brand-accent-soft', shade(value.accentColor, 0.92));
      root.style.setProperty('--brand-accent-border', shade(value.accentColor, 0.7));
    }
  }
}

/** Mix toward white (amount > 0) or black (amount < 0). */
function shade(hex: string, amount: number): string {
  const num = parseInt(hex.slice(1), 16);
  const target = amount > 0 ? 255 : 0;
  const ratio = Math.abs(amount);
  const mix = (channel: number) => Math.round(channel + (target - channel) * ratio);
  const r = mix((num >> 16) & 255);
  const g = mix((num >> 8) & 255);
  const b = mix(num & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
