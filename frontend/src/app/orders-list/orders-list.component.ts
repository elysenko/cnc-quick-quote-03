import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { QueryParamStateService } from '../core/query-param-state.service';
import { Order, OrderStatus, centsToUsd } from '../core/models';

const PAGE_SIZE = 5;
const VIEW_STATES = ['ready', 'loading', 'error', 'empty'] as const;
type ViewState = (typeof VIEW_STATES)[number];

const STATUSES = ['all', 'paid', 'in_production', 'shipped', 'cancelled'] as const;
type StatusFilter = (typeof STATUSES)[number];

const LABELS: Record<OrderStatus, string> = {
  paid: 'Paid',
  in_production: 'In production',
  shipped: 'Shipped',
  cancelled: 'Cancelled',
};

@Component({
  selector: 'app-orders-list',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './orders-list.component.html',
  styleUrl: './orders-list.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrdersListComponent {
  private readonly params = inject(QueryParamStateService);

  readonly orders = signal<Order[]>([
    { id: 'ord_9f21', orderNumber: 'ORD-2026-0912', confirmationNumber: 'CNF-7QX4-2M8D', customerName: 'Dana Ortiz', quoteReference: 'Q-2026-2418', materialName: 'Stainless 304 — 16 ga', quantity: 24, shippingMethod: 'Ground freight', subtotalCents: 41_866, shippingCents: 2_690, totalCents: 44_556, status: 'paid', placedAt: '2026-09-05T15:41:00Z' },
    { id: 'ord_9e88', orderNumber: 'ORD-2026-0908', confirmationNumber: 'CNF-4KD9-7T1P', customerName: 'Dana Ortiz', quoteReference: 'Q-2026-2417', materialName: 'Mild steel — 14 ga', quantity: 120, shippingMethod: 'Express 2-day', subtotalCents: 62_140, shippingCents: 7_750, totalCents: 69_890, status: 'in_production', placedAt: '2026-09-03T10:11:00Z' },
    { id: 'ord_9d02', orderNumber: 'ORD-2026-0891', confirmationNumber: 'CNF-2WM6-9B3H', customerName: 'Dana Ortiz', quoteReference: 'Q-2026-2414', materialName: 'Aluminium 6061 — 0.090"', quantity: 32, shippingMethod: 'Ground freight', subtotalCents: 128_420, shippingCents: 3_530, totalCents: 131_950, status: 'shipped', placedAt: '2026-08-27T09:20:00Z' },
    { id: 'ord_9c47', orderNumber: 'ORD-2026-0874', confirmationNumber: 'CNF-8HN2-5Q7R', customerName: 'Dana Ortiz', quoteReference: 'Q-2026-2409', materialName: 'Stainless 304 — 16 ga', quantity: 6, shippingMethod: 'Shop pickup', subtotalCents: 18_940, shippingCents: 0, totalCents: 18_940, status: 'shipped', placedAt: '2026-08-19T14:02:00Z' },
    { id: 'ord_9b13', orderNumber: 'ORD-2026-0852', confirmationNumber: 'CNF-6RJ8-3L4V', customerName: 'Dana Ortiz', quoteReference: 'Q-2026-2401', materialName: 'Mild steel — 14 ga', quantity: 250, shippingMethod: 'Ground freight', subtotalCents: 214_600, shippingCents: 5_210, totalCents: 219_810, status: 'cancelled', placedAt: '2026-08-11T11:45:00Z' },
    { id: 'ord_9a06', orderNumber: 'ORD-2026-0838', confirmationNumber: 'CNF-1XT5-8C2N', customerName: 'Dana Ortiz', quoteReference: 'Q-2026-2396', materialName: 'Aluminium 5052 — 0.125"', quantity: 18, shippingMethod: 'Express 2-day', subtotalCents: 57_300, shippingCents: 6_800, totalCents: 64_100, status: 'shipped', placedAt: '2026-08-04T08:30:00Z' },
  ]);

  /** Loading / error / empty each get a URL so they are reviewable: ?state=… */
  readonly state = this.params.read<ViewState>('state', 'ready', VIEW_STATES);
  readonly loading = computed(() => this.state() === 'loading');
  readonly error = computed(() =>
    this.state() === 'error' ? 'The orders service did not respond. Please try again.' : null,
  );

  readonly page = this.params.readNumber('page', 1);
  readonly status = this.params.read<StatusFilter>('status', 'all', STATUSES);
  readonly money = centsToUsd;

  readonly filtered = computed(() => {
    if (this.state() === 'empty') return [];
    const status = this.status();
    if (status === 'all') return this.orders();
    return this.orders().filter((order) => order.status === status);
  });

  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.filtered().length / PAGE_SIZE)));

  readonly paged = computed(() => {
    const start = (Math.min(this.page(), this.pageCount()) - 1) * PAGE_SIZE;
    return this.filtered().slice(start, start + PAGE_SIZE);
  });

  retry(): void {
    this.params.patch({ state: null });
  }

  setStatus(event: Event): void {
    this.params.patch({ status: (event.target as HTMLSelectElement).value, page: 1 });
  }

  go(page: number): void {
    this.params.patch({ page: Math.min(Math.max(1, page), this.pageCount()) });
  }

  label(status: OrderStatus): string {
    return LABELS[status];
  }

  statusClass(status: OrderStatus): string {
    if (status === 'shipped') return 'badge--success';
    if (status === 'in_production') return 'badge--warn';
    if (status === 'cancelled') return 'badge--danger';
    return 'badge--info';
  }
}
