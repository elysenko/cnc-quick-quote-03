import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-quote-wizard',
  standalone: true,
  imports: [RouterOutlet, RouterLink],
  templateUrl: './quote-wizard.component.html',
  styleUrl: './quote-wizard.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuoteWizardComponent {
  private readonly router = inject(Router);

  /** Each step is a child route, so the wizard position is always in the URL. */
  readonly steps = [
    { path: 'upload', label: 'Upload drawing' },
    { path: 'material', label: 'Material' },
    { path: 'bends', label: 'Bends' },
    { path: 'review', label: 'Review' },
  ];

  isActive(path: string): boolean {
    return this.router.url.includes(`/quote/new/${path}`);
  }
}
