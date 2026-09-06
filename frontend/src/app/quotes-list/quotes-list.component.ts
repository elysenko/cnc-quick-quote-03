import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { QueryParamStateService } from '../core/query-param-state.service';
import { ApiService, apiErrorMessage } from '../core/api.service';
import { Quote, QuoteStatus, centsToUsd } from '../core/models';

const PAGE_SIZE = 6;

const SORTS = ['newest', 'oldest', 'total'] as const;
type Sort = (typeof SORTS)[number];

@Component({
  selector: 'app-quotes-list',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './quotes-list.component.html',
  styleUrl: './quotes-list.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuotesListComponent {
  private readonly params = inject(QueryParamStateService);
  private readonly api = inject(ApiService);

  readonly quotes = signal<Quote[]>([]);

  /** True until the first request settles, and again for every `retry()`. */
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly page = this.params.readNumber('page', 1);
  readonly sort = this.params.read<Sort>('sort', 'newest', SORTS);
  readonly money = centsToUsd;

  readonly sorted = computed(() => {
    const list = [...this.quotes()];
    switch (this.sort()) {
      case 'oldest':
        return list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      case 'total':
        return list.sort((a, b) => b.totalCents - a.totalCents);
      default:
        return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
  });

  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.sorted().length / PAGE_SIZE)));

  readonly paged = computed(() => {
    const start = (Math.min(this.page(), this.pageCount()) - 1) * PAGE_SIZE;
    return this.sorted().slice(start, start + PAGE_SIZE);
  });

  constructor() {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(null);
    void this.api
      .quotes()
      .then((quotes) => this.quotes.set(quotes))
      .catch((error: unknown) => {
        this.quotes.set([]);
        this.error.set(
          apiErrorMessage(error, 'The quotes service did not respond. Please try again.'),
        );
      })
      .finally(() => this.loading.set(false));
  }

  setSort(event: Event): void {
    this.params.patch({ sort: (event.target as HTMLSelectElement).value, page: 1 });
  }

  go(page: number): void {
    this.params.patch({ page: Math.min(Math.max(1, page), this.pageCount()) });
  }

  retry(): void {
    this.load();
  }

  statusClass(status: QuoteStatus): string {
    if (status === 'ordered') return 'badge--success';
    if (status === 'ready') return 'badge--info';
    if (status === 'expired') return 'badge--danger';
    return '';
  }
}
