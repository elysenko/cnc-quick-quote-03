import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { BrandingService } from '../core/branding.service';

@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './signup.component.html',
  styleUrl: './auth-shell.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignupComponent {
  private readonly auth = inject(AuthService);
  readonly branding = inject(BrandingService).branding;

  readonly name = signal('');
  readonly email = signal('');
  readonly password = signal('');
  readonly confirm = signal('');
  readonly error = this.auth.authError;

  readonly previewShortcut = signal(COLOSSUS_PREVIEW ? 'Skip login — Demo Mode' : null);

  submit(): void {
    if (this.password() !== this.confirm()) {
      this.auth.authError.set('Those two passwords do not match.');
      return;
    }
    this.auth.register(this.name(), this.email(), this.password());
  }

  skipLogin(): void {
    this.auth.previewSignIn();
  }
}
