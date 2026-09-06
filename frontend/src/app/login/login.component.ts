import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { BrandingService } from '../core/branding.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './auth-shell.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  readonly branding = inject(BrandingService).branding;

  // Ship empty. No credential literals live anywhere in this app.
  readonly email = signal('');
  readonly password = signal('');
  readonly error = this.auth.authError;

  /**
   * Preview-only secondary path. Held in TypeScript behind the build-time constant so
   * the whole affordance is dead-code-eliminated from the production bundle, and it
   * seeds signed-in state directly rather than submitting any credentials.
   */
  readonly previewShortcut = signal(COLOSSUS_PREVIEW ? 'Skip login — Demo Mode' : null);

  submit(): void {
    this.auth.login(this.email(), this.password());
  }

  skipLogin(): void {
    this.auth.previewSignIn();
  }
}
