import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './admin-layout.component.html',
  styleUrl: './admin.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminLayoutComponent {
  readonly sections = [
    { id: 'settings', label: 'Services', path: '/admin/settings' },
    { id: 'materials', label: 'Materials', path: '/admin/materials' },
    { id: 'pricing', label: 'Pricing', path: '/admin/pricing' },
    { id: 'machine', label: 'Machine & uploads', path: '/admin/machine' },
    { id: 'business', label: 'Business', path: '/admin/business' },
    { id: 'orders', label: 'Orders', path: '/admin/orders' },
  ];
}
