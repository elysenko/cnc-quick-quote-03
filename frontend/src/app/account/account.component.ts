import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { ApiService } from '../core/api.service';
import { centsToUsd } from '../core/models';

const SAVED_NOTICE_MS = 2500;

@Component({
  selector: 'app-account',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './account.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountComponent {
  private readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);

  /** Seeded from the live session so the fields are never blank, then reconciled with /account. */
  readonly name = signal(this.auth.user()?.name ?? '');
  readonly email = signal(this.auth.user()?.email ?? '');
  readonly company = signal('');
  readonly saved = signal(false);

  readonly quoteCount = signal(0);
  readonly orderCount = signal(0);
  readonly lifetimeSpendCents = signal(0);

  readonly isAdmin = this.auth.isAdmin;
  readonly role = computed(() => this.auth.user()?.role ?? 'USER');
  readonly memberSince = computed(() => (this.auth.user()?.createdAt ?? '').slice(0, 10));
  readonly money = centsToUsd;

  private savedTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    void this.api
      .accountProfile()
      .then((profile) => {
        this.name.set(profile.name);
        this.email.set(profile.email);
        this.company.set(profile.company);
      })
      .catch(() => undefined);

    void this.api
      .accountStats()
      .then((stats) => {
        this.quoteCount.set(stats.quoteCount);
        this.orderCount.set(stats.orderCount);
        this.lifetimeSpendCents.set(stats.lifetimeSpendCents);
      })
      .catch(() => undefined);
  }

  /** The approved markup has no error slot on this form, so a failure simply never confirms. */
  save(): void {
    void this.api
      .updateAccount({ name: this.name(), company: this.company() })
      .then(() => {
        this.saved.set(true);
        if (this.savedTimer !== null) clearTimeout(this.savedTimer);
        this.savedTimer = setTimeout(() => this.saved.set(false), SAVED_NOTICE_MS);
      })
      .catch(() => this.saved.set(false));
  }

  signOut(): void {
    this.auth.logout();
  }
}
