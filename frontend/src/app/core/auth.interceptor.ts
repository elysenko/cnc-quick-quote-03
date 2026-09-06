import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { tokenStore } from './token-store';

const REFRESH_URL = '/api/auth/refresh';

/** Requests that must never carry a stale token or trigger a refresh loop. */
const isAuthEndpoint = (url: string): boolean =>
  url.includes('/api/auth/login') ||
  url.includes('/api/auth/register') ||
  url.includes(REFRESH_URL);

let refreshInFlight: Promise<boolean> | null = null;

/** Single-flight refresh: concurrent 401s wait on one round trip, not N. */
async function refreshOnce(): Promise<boolean> {
  const refreshToken = tokenStore.refresh();
  if (!refreshToken) return false;
  if (!refreshInFlight) {
    refreshInFlight = fetch(REFRESH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
      .then(async (response) => {
        if (!response.ok) return false;
        const body = (await response.json()) as { accessToken: string; refreshToken: string };
        tokenStore.set(body.accessToken, body.refreshToken);
        return true;
      })
      .catch(() => false)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

const withToken = (request: HttpRequest<unknown>, token: string): HttpRequest<unknown> =>
  request.clone({ setHeaders: { Authorization: `Bearer ${token}` } });

/**
 * Attaches the access token and, on a 401, refreshes once and replays the request.
 * A second failure propagates so AuthService can end the session cleanly.
 */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const token = tokenStore.access();
  const authed = token && !isAuthEndpoint(request.url) ? withToken(request, token) : request;

  return next(authed).pipe(
    catchError((error: unknown) => {
      const is401 = error instanceof HttpErrorResponse && error.status === 401;
      if (!is401 || isAuthEndpoint(request.url)) return throwError(() => error);

      return from(refreshOnce()).pipe(
        switchMap((refreshed) => {
          const fresh = tokenStore.access();
          if (!refreshed || !fresh) {
            tokenStore.clear();
            return throwError(() => error);
          }
          return next(withToken(request, fresh));
        }),
      );
    }),
  );
};
