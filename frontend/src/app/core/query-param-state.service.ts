import { Injectable, inject } from '@angular/core';
import { ActivatedRoute, Params, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { Signal, computed } from '@angular/core';

/**
 * URL-addressable UI state.
 *
 * Panels (`?panel=breakdown|nesting`), modals (`?modal=confirm-order`), paging and
 * sorting all live in the query string so a reviewer can deep-link into them and a
 * reload restores exactly what they were looking at.
 */
@Injectable({ providedIn: 'root' })
export class QueryParamStateService {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private readonly params: Signal<Params> = toSignal(this.route.queryParams, {
    initialValue: {} as Params,
  });

  /** Reactive read of one query param, with a fallback and optional allow-list. */
  read<T extends string>(key: string, fallback: T, allowed?: readonly T[]): Signal<T> {
    return computed(() => {
      const raw = this.params()[key];
      if (typeof raw !== 'string' || raw === '') return fallback;
      if (allowed && !allowed.includes(raw as T)) return fallback;
      return raw as T;
    });
  }

  readNumber(key: string, fallback: number): Signal<number> {
    return computed(() => {
      const parsed = Number(this.params()[key]);
      return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
    });
  }

  /**
   * Merge-patch the query string, preserving the current path.
   *
   * Built explicitly from `router.url` rather than `navigate([], {relativeTo})`: this
   * service lives in the root injector, so its ActivatedRoute is the *root* route — a
   * relative navigation from there resolves to `/` and would drop the current screen.
   */
  patch(next: Record<string, string | number | null>): void {
    const path = this.router.url.split('?')[0];
    const merged: Params = { ...this.params() };
    for (const [key, value] of Object.entries(next)) {
      if (value === null || value === '') delete merged[key];
      else merged[key] = String(value);
    }
    void this.router.navigate([path], { queryParams: merged, replaceUrl: true });
  }
}
