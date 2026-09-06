import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { QueryParamStateService } from '../core/query-param-state.service';
import { ApiService } from '../core/api.service';
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
  private readonly api = inject(ApiService);

  readonly orders = signal<Order[]>([]);

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

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      this.orders.set(await this.api.adminOrders());
    } catch {
      // No orders to show; the template renders its own empty state.
      this.orders.set([]);
    }
  }

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
