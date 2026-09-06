import { ApplicationConfig } from '@angular/core';
import {
  provideRouter,
  withComponentInputBinding,
  withHashLocation,
  withInMemoryScrolling,
} from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { routes } from './app.routes';
import { authInterceptor } from './core/auth.interceptor';

/**
 * The backend exposes a plain REST API under `/api` (Swagger at `/api/docs`); all
 * calls go through `ApiService`, and `authInterceptor` owns the access token plus the
 * 401 → refresh → retry-once flow.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    // Hash routing: the app is served as static files behind an SPA fallback, and every
    // screen must survive a cold deep-link load.
    provideRouter(
      routes,
      withHashLocation(),
      // Binds route params and resolved data straight to component inputs.
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'top' }),
    ),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideAnimations(),
  ],
};
