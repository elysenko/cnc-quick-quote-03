import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ShippingMethod, centsToUsd } from '../core/models';

@Component({
  selector: 'app-business-shipping',
  standalone: true,
  templateUrl: './business-shipping.component.html',
  styleUrls: ['./admin.css', './business.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BusinessShippingComponent {
  readonly methods = signal<ShippingMethod[]>([
    { id: 'ship_pickup', name: 'Shop pickup', description: 'Ready in 3 business days', baseRateCents: 0, perSheetRateCents: 0, active: true, sortOrder: 1 },
    { id: 'ship_ground', name: 'Ground freight', description: 'Delivered in 4–6 business days', baseRateCents: 1_850, perSheetRateCents: 420, active: true, sortOrder: 2 },
    { id: 'ship_express', name: 'Express 2-day', description: 'Delivered in 2 business days', baseRateCents: 4_900, perSheetRateCents: 950, active: true, sortOrder: 3 },
    { id: 'ship_ltl', name: 'LTL pallet freight', description: 'For orders over 12 sheets', baseRateCents: 18_500, perSheetRateCents: 260, active: false, sortOrder: 4 },
  ]);

  readonly money = centsToUsd;

  toggle(id: string): void {
    this.methods.update((list) =>
      list.map((m) => (m.id === id ? { ...m, active: !m.active } : m)),
    );
  }

  rename(id: string, event: Event): void {
    const name = (event.target as HTMLInputElement).value;
    this.methods.update((list) => list.map((m) => (m.id === id ? { ...m, name } : m)));
  }

  add(): void {
    this.methods.update((list) => [
      ...list,
      {
        id: `ship_new_${list.length + 1}`,
        name: 'New method',
        description: 'Describe the delivery window',
        baseRateCents: 0,
        perSheetRateCents: 0,
        active: false,
        sortOrder: list.length + 1,
      },
    ]);
  }
}
