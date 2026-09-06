import { inject } from '@angular/core';
import { ResolveFn, Router } from '@angular/router';
import { ApiService } from '../core/api.service';
import { QuoteDetail } from '../core/models';

/**
 * Resolves the quote before the detail route activates.
 *
 * The approved detail template dereferences `quote()` throughout and has no loading
 * branch, so the component must never exist without its data. Resolving here — rather
 * than fetching inside the component — makes that structural instead of defensive.
 * An unreachable or foreign quote falls back to the list rather than a blank screen.
 */
export const quoteDetailResolver: ResolveFn<QuoteDetail | null> = async (route) => {
  const api = inject(ApiService);
  const router = inject(Router);
  const id = route.paramMap.get('id');
  if (!id) {
    void router.navigate(['/quotes']);
    return null;
  }
  try {
    return await api.quote(id);
  } catch {
    void router.navigate(['/quotes']);
    return null;
  }
};
