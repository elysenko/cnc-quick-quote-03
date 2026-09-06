import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthUser, Role } from './models';
import { readValidated, removeKeys, writeJson } from './storage';
import { tokenStore } from './token-store';
import { ApiService, apiErrorMessage } from './api.service';

const USER_KEY = 'user';

const ROLES: readonly Role[] = ['USER', 'MANAGER', 'ADMIN'];

/** Untrusted-input guard for anything restored from browser storage. */
function isAuthUser(value: unknown): value is AuthUser {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate['id'] === 'string' &&
    typeof candidate['email'] === 'string' &&
    typeof candidate['name'] === 'string' &&
    typeof candidate['role'] === 'string' &&
    ROLES.includes(candidate['role'] as Role)
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Sign-in state.
 *
 * `login`/`register` return synchronously (true when the form passed client-side
 * validation) because the templates call them from a submit handler, and then finish
 * the round trip in the background — a rejected request lands in `authError`, which
 * the form already renders.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly router = inject(Router);
  private readonly api = inject(ApiService);

  private readonly _user = signal<AuthUser | null>(null);
  readonly user = this._user.asReadonly();
  readonly isAuthenticated = computed(() => this._user() !== null);
  readonly isAdmin = computed(() => this._user()?.role === 'ADMIN');

  /** Set after a failed attempt so the login form can render an inline error. */
  readonly authError = signal<string | null>(null);
  readonly busy = signal(false);

  /** URL the guard bounced away from, replayed after a successful sign-in. */
  private redirectUrl: string | null = null;

  constructor() {
    this.restore();
  }

  /** Defensive restore — never throws, never blanks the page. */
  private restore(): void {
    try {
      const restored = readValidated<AuthUser>(USER_KEY, isAuthUser);
      if (restored && tokenStore.access()) {
        this._user.set(restored);
        // Confirm the stored session is still valid; a revoked one signs out quietly.
        void this.api
          .me()
          .then((user) => this.persist(user))
          .catch(() => this.clearSession());
      } else {
        this.clearSession();
      }
    } catch {
      this.clearSession();
    }
  }

  setRedirectUrl(url: string | null): void {
    this.redirectUrl = url;
  }

  private consumeRedirect(fallback: string): string {
    const target = this.redirectUrl ?? fallback;
    this.redirectUrl = null;
    return target;
  }

  private persist(user: AuthUser): void {
    this._user.set(user);
    writeJson(USER_KEY, user);
    this.authError.set(null);
  }

  private clearSession(): void {
    this._user.set(null);
    tokenStore.clear();
    removeKeys(USER_KEY);
  }

  login(email: string, password: string): boolean {
    const trimmed = email.trim();
    if (!trimmed || !password) {
      this.authError.set('Enter your email address and password to continue.');
      return false;
    }
    if (!EMAIL_RE.test(trimmed)) {
      this.authError.set('That does not look like a valid email address.');
      return false;
    }

    if (COLOSSUS_PREVIEW) {
      this.previewSignIn();
      return true;
    }

    this.authError.set(null);
    this.busy.set(true);
    void this.api
      .login(trimmed, password)
      .then((result) => {
        tokenStore.set(result.accessToken, result.refreshToken);
        this.persist(result.user);
        void this.router.navigateByUrl(this.consumeRedirect('/quotes'));
      })
      .catch((error: unknown) =>
        this.authError.set(
          apiErrorMessage(error, 'That email address and password do not match.'),
        ),
      )
      .finally(() => this.busy.set(false));
    return true;
  }

  register(name: string, email: string, password: string): boolean {
    const trimmed = email.trim();
    if (!name.trim() || !trimmed || !password) {
      this.authError.set('Fill in every field to create your account.');
      return false;
    }
    if (!EMAIL_RE.test(trimmed)) {
      this.authError.set('That does not look like a valid email address.');
      return false;
    }

    if (COLOSSUS_PREVIEW) {
      this.previewSignIn();
      return true;
    }

    this.authError.set(null);
    this.busy.set(true);
    void this.api
      .register(name.trim(), trimmed, password)
      .then((result) => {
        tokenStore.set(result.accessToken, result.refreshToken);
        this.persist(result.user);
        void this.router.navigateByUrl(this.consumeRedirect('/quote/new/upload'));
      })
      .catch((error: unknown) =>
        this.authError.set(apiErrorMessage(error, 'That account could not be created.')),
      )
      .finally(() => this.busy.set(false));
    return true;
  }

  logout(): void {
    const refreshToken = tokenStore.refresh();
    if (!COLOSSUS_PREVIEW && refreshToken) {
      void this.api.logout(refreshToken).catch(() => undefined);
    }
    this.clearSession();
    void this.router.navigateByUrl('/login');
  }

  /**
   * Preview-only shortcut. Seeds signed-in state directly so every screen stays
   * reviewable in the static mockup host; dead-code-eliminated from production.
   */
  previewSignIn(): void {
    if (!COLOSSUS_PREVIEW) return;
    this.persist(this.previewUser());
    void this.router.navigateByUrl(this.consumeRedirect('/quotes'));
  }

  /** Preview-only: a cold load of an authenticated route renders that route. */
  ensurePreviewSession(): void {
    if (!COLOSSUS_PREVIEW) return;
    if (this._user() === null) this.persist(this.previewUser());
  }

  private previewUser(): AuthUser {
    return {
      id: 'preview',
      email: 'preview@example.invalid',
      name: 'Preview',
      role: 'ADMIN',
      createdAt: new Date().toISOString(),
    };
  }
}
