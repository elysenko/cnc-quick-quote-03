import { DestroyRef, Injectable, inject, signal } from '@angular/core';

const MOBILE_QUERY = '(max-width: 768px)';

/**
 * Breakpoint state as a signal, so components can swap behaviour (bottom sheet vs
 * side panel, tab bar vs header nav) rather than relying on CSS alone.
 */
@Injectable({ providedIn: 'root' })
export class LayoutService {
  private readonly _isHandset = signal(false);
  readonly isHandset = this._isHandset.asReadonly();

  constructor() {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia(MOBILE_QUERY);
    this._isHandset.set(mql.matches);
    const onChange = (event: MediaQueryListEvent) => this._isHandset.set(event.matches);
    mql.addEventListener('change', onChange);
    inject(DestroyRef).onDestroy(() => mql.removeEventListener('change', onChange));
  }
}
