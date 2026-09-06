import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-business-contact',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './business-contact.component.html',
  styleUrls: ['./admin.css', './business.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BusinessContactComponent {
  readonly email = signal('orders@fieldworks-fab.example');
  readonly phone = signal('+1 (503) 555-0148');
  readonly hours = signal('Mon–Fri, 7am–4pm PT');
  readonly address = signal('2140 SE Foundry Way\nPortland, OR 97214');
  readonly saved = signal(false);

  save(): void {
    this.saved.set(true);
    setTimeout(() => this.saved.set(false), 2500);
  }
}
