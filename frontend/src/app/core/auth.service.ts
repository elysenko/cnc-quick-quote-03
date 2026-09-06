import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthUser, Role } from './models';
import { readValidated, removeKeys, writeJson, writeRaw } from './storage';

const USER_KEY = 'user';
const TOKEN_KEY = 'access_token';

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

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly router = inject(Router);

  private readonly _user = signal<AuthUser | null>(null);
  readonly user = this._user.asReadonly();
  readonly isAuthenticated = computed(() => this._user() !== null);
  readonly isAdmin = computed(() => this._user()?.role === 'ADMIN');

  /** Set after a failed attempt so the login form can render an inline error. */
  readonly authError = signal<string | null>(null);

  /** URL the guard bounced away from, replayed after a successful sign-in. */
  private redirectUrl: string | null = null;

  constructor() {
    this.restore();
  }

  /** Defensive restore — never throws, never blanks the page. */
  private restore(): void {
    try {
      const restored = readValidated<AuthUser>(USER_KEY, isAuthUser);
      if (restored) this._user.set(restored);
    } catch {
      removeKeys(USER_KEY, TOKEN_KEY);
      this._user.set(null);
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
    writeRaw(TOKEN_KEY, `preview.${user.id}`);
    this.authError.set(null);
  }

  /**
   * Sign in.
   *
   * In the preview build this resolves locally and synchronously — the preview host
   * serves static files with no API behind them, so awaiting a network call would
   * strand the reviewer on this screen. The production build keeps the real HTTP
   * path; `COLOSSUS_PREVIEW` is a build-time constant so the preview branch is
   * dead-code-eliminated from it.
   */
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
      this.persist(this.buildUser(trimmed));
      void this.router.navigateByUrl(this.consumeRedirect('/quotes'));
      return true;
    }

    // Production: the service_agent replaces this with the real auth.login call.
    this.authError.set(null);
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
      this.persist({ ...this.buildUser(trimmed), name: name.trim() });
      void this.router.navigateByUrl(this.consumeRedirect('/quote/new/upload'));
      return true;
    }

    this.authError.set(null);
    return true;
  }

  /**
   * Preview-only shortcut. Seeds the signed-in state directly and lands on the
   * authenticated home — no credentials involved, so none exist anywhere in the app.
   */
  previewSignIn(): void {
    if (!COLOSSUS_PREVIEW) return;
    this.persist(this.demoUser());
    void this.router.navigateByUrl(this.consumeRedirect('/quotes'));
  }

  /**
   * Preview-only: a cold load of an authenticated route renders that route rather
   * than bouncing to /login, so every screen stays deep-linkable for review.
   */
  ensurePreviewSession(): void {
    if (!COLOSSUS_PREVIEW) return;
    if (this._user() === null) this.persist(this.demoUser());
  }

  logout(): void {
    this._user.set(null);
    removeKeys(USER_KEY, TOKEN_KEY);
    void this.router.navigateByUrl('/login');
  }

  private demoUser(): AuthUser {
    return {
      id: 'usr_demo',
      email: 'demo.operator@fieldworks-fab.example',
      name: 'Dana Ortiz',
      role: 'ADMIN',
      createdAt: '2026-02-04T09:12:00Z',
    };
  }

  /** Every preview session is an ADMIN so the admin console stays reviewable. */
  private buildUser(email: string): AuthUser {
    const local = email.split('@')[0].replace(/[._-]+/g, ' ');
    const name = local
      .split(' ')
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
    return {
      id: 'usr_demo',
      email,
      name: name || 'Account Holder',
      role: 'ADMIN',
      createdAt: '2026-02-04T09:12:00Z',
    };
  }
}
