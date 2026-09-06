import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs';
import { AuthService } from './core/auth.service';
import { BrandingService } from './core/branding.service';
import { LayoutService } from './core/layout.service';

interface NavItem {
  id: string;
  label: string;
  path: string;
  glyph: string;
  adminOnly?: boolean;
}

const NAV: NavItem[] = [
  { id: 'new-quote', label: 'New quote', path: '/quote/new/upload', glyph: '＋' },
  { id: 'quotes', label: 'Quotes', path: '/quotes', glyph: '▤' },
  { id: 'orders', label: 'Orders', path: '/orders', glyph: '◱' },
  { id: 'account', label: 'Account', path: '/account', glyph: '☺' },
  { id: 'admin', label: 'Admin', path: '/admin/settings', glyph: '⚙', adminOnly: true },
];

/** Routes that render without the app chrome (their own full-bleed layout). */
const BARE_ROUTES = ['/login', '/signup'];

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  // data-testid="app-ready" is the universal readiness landmark: it enters the DOM only
  // after Angular bootstraps this root component, so the render gate can wait on it to
  // confirm the SPA hydrated (not a blank shell / 404 / failed bundle). Keep it here.
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly branding = inject(BrandingService).branding;

  /** Breakpoint-driven, so the nav swap is real behaviour rather than CSS-only. */
  readonly isHandset = inject(LayoutService).isHandset;

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  readonly chromeVisible = computed(
    () => !BARE_ROUTES.some((route) => this.url().startsWith(route)),
  );

  /** The Admin entry appears only for an ADMIN role. */
  readonly visibleNav = computed(() =>
    NAV.filter((item) => item.id !== 'new-quote' && (!item.adminOnly || this.auth.isAdmin())),
  );

  readonly visibleTabs = computed(() =>
    NAV.filter((item) => !item.adminOnly || this.auth.isAdmin()),
  );

  signOut(): void {
    this.auth.logout();
  }
}
