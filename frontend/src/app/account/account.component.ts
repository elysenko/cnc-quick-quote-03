import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { centsToUsd } from '../core/models';

@Component({
  selector: 'app-account',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './account.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountComponent {
  private readonly auth = inject(AuthService);

  readonly name = signal(this.auth.user()?.name ?? '');
  readonly email = signal(this.auth.user()?.email ?? '');
  readonly company = signal('Fieldworks Fabrication');
  readonly saved = signal(false);

  readonly quoteCount = signal(7);
  readonly orderCount = signal(6);
  readonly lifetimeSpendCents = signal(549_246);

  readonly isAdmin = this.auth.isAdmin;
  readonly role = computed(() => this.auth.user()?.role ?? 'USER');
  readonly memberSince = computed(() => (this.auth.user()?.createdAt ?? '').slice(0, 10));
  readonly money = centsToUsd;

  save(): void {
    this.saved.set(true);
    setTimeout(() => this.saved.set(false), 2500);
  }

  signOut(): void {
    this.auth.logout();
  }
}
