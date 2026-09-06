import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { AuthService } from './auth.service';

/**
 * Redirects at most once and never from a state that can bounce back, so a
 * guard/shell redirect loop (which blocks the main thread and renders a
 * permanently blank page) is structurally impossible.
 */
export const authGuard: CanActivateFn = (_route, state): boolean | UrlTree => {
  const auth = inject(AuthService);

  if (COLOSSUS_PREVIEW) {
    auth.ensurePreviewSession();
    return true;
  }

  if (auth.isAuthenticated()) return true;
  auth.setRedirectUrl(state.url);
  return inject(Router).parseUrl('/login');
};

export const adminGuard: CanActivateFn = (): boolean | UrlTree => {
  const auth = inject(AuthService);
  if (auth.isAdmin()) return true;
  return inject(Router).parseUrl('/forbidden');
};
