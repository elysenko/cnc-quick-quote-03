import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { QueryParamStateService } from '../core/query-param-state.service';
import { Order, OrderStatus, centsToUsd } from '../core/models';

const STATUSES = ['all', 'paid', 'in_production', 'shipped', 'cancelled'] as const;
type StatusFilter = (typeof STATUSES)[number];

@Component({
  selector: 'app-admin-orders',
  standalone: true,
  templateUrl: './admin-orders.component.html',
  styleUrls: ['./admin.css', '../quotes-list/quotes-list.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminOrdersComponent {
  private readonly params = inject(QueryParamStateService);

  readonly orders = signal<Order[]>([
    { id: 'ord_9f21', orderNumber: 'ORD-2026-0912', confirmationNumber: 'CNF-7QX4-2M8D', customerName: 'Dana Ortiz', quoteReference: 'Q-2026-2418', materialName: 'Stainless 304 — 16 ga', quantity: 24, shippingMethod: 'Ground freight', subtotalCents: 41_866, shippingCents: 2_690, totalCents: 44_556, status: 'paid', placedAt: '2026-09-05T15:41:00Z' },
    { id: 'ord_9e88', orderNumber: 'ORD-2026-0908', confirmationNumber: 'CNF-4KD9-7T1P', customerName: 'Marcus Bell', quoteReference: 'Q-2026-2417', materialName: 'Mild steel — 14 ga', quantity: 120, shippingMethod: 'Express 2-day', subtotalCents: 62_140, shippingCents: 7_750, totalCents: 69_890, status: 'in_production', placedAt: '2026-09-03T10:11:00Z' },
    { id: 'ord_9d02', orderNumber: 'ORD-2026-0891', confirmationNumber: 'CNF-2WM6-9B3H', customerName: 'Priya Raman', quoteReference: 'Q-2026-2414', materialName: 'Aluminium 6061 — 0.090"', quantity: 32, shippingMethod: 'Ground freight', subtotalCents: 128_420, shippingCents: 3_530, totalCents: 131_950, status: 'shipped', placedAt: '2026-08-27T09:20:00Z' },
    { id: 'ord_9c47', orderNumber: 'ORD-2026-0874', confirmationNumber: 'CNF-8HN2-5Q7R', customerName: 'Tomas Lindqvist', quoteReference: 'Q-2026-2409', materialName: 'Stainless 304 — 16 ga', quantity: 6, shippingMethod: 'Shop pickup', subtotalCents: 18_940, shippingCents: 0, totalCents: 18_940, status: 'shipped', placedAt: '2026-08-19T14:02:00Z' },
    { id: 'ord_9b13', orderNumber: 'ORD-2026-0852', confirmationNumber: 'CNF-6RJ8-3L4V', customerName: 'Alina Novak', quoteReference: 'Q-2026-2401', materialName: 'Mild steel — 14 ga', quantity: 250, shippingMethod: 'Ground freight', subtotalCents: 214_600, shippingCents: 5_210, totalCents: 219_810, status: 'cancelled', placedAt: '2026-08-11T11:45:00Z' },
  ]);

  readonly status = this.params.read<StatusFilter>('status', 'all', STATUSES);
  readonly search = this.params.read<string>('q', '');
  readonly money = centsToUsd;

  readonly filtered = computed(() => {
    const status = this.status();
    const term = this.search().trim().toLowerCase();
    return this.orders().filter((order) => {
      const statusOk = status === 'all' || order.status === status;
      const searchOk =
        !term ||
        order.customerName.toLowerCase().includes(term) ||
        order.orderNumber.toLowerCase().includes(term);
      return statusOk && searchOk;
    });
  });

  setStatus(event: Event): void {
    this.params.patch({ status: (event.target as HTMLSelectElement).value });
  }

  setSearch(event: Event): void {
    this.params.patch({ q: (event.target as HTMLInputElement).value || null });
  }

  statusClass(status: OrderStatus): string {
    if (status === 'shipped') return 'badge--success';
    if (status === 'in_production') return 'badge--warn';
    if (status === 'cancelled') return 'badge--danger';
    return 'badge--info';
  }
}
