import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { QueryParamStateService } from '../core/query-param-state.service';
import { ApiService, apiErrorMessage } from '../core/api.service';
import { Order, OrderStatus, centsToUsd } from '../core/models';

const PAGE_SIZE = 5;

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
  private readonly api = inject(ApiService);

  readonly orders = signal<Order[]>([]);

  /** True until the first request settles, and again for every `retry()`. */
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly page = this.params.readNumber('page', 1);
  readonly status = this.params.read<StatusFilter>('status', 'all', STATUSES);
  readonly money = centsToUsd;

  readonly filtered = computed(() => {
    const status = this.status();
    if (status === 'all') return this.orders();
    return this.orders().filter((order) => order.status === status);
  });

  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.filtered().length / PAGE_SIZE)));

  readonly paged = computed(() => {
    const start = (Math.min(this.page(), this.pageCount()) - 1) * PAGE_SIZE;
    return this.filtered().slice(start, start + PAGE_SIZE);
  });

  constructor() {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(null);
    void this.api
      .orders()
      .then((orders) => this.orders.set(orders))
      .catch((error: unknown) => {
        this.orders.set([]);
        this.error.set(
          apiErrorMessage(error, 'The orders service did not respond. Please try again.'),
        );
      })
      .finally(() => this.loading.set(false));
  }

  retry(): void {
    this.load();
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
