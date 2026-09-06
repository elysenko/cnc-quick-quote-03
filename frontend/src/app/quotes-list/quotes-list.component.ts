import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { QueryParamStateService } from '../core/query-param-state.service';
import { Quote, QuoteStatus, centsToUsd } from '../core/models';

const PAGE_SIZE = 6;
const VIEW_STATES = ['ready', 'loading', 'error', 'empty'] as const;
type ViewState = (typeof VIEW_STATES)[number];

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

  readonly quotes = signal<Quote[]>([
    { id: 'q_2418', reference: 'Q-2026-2418', materialId: 'mat_ss304_16', materialName: 'Stainless 304 — 16 ga', filename: 'mount-bracket-rev-c.dxf', quantity: 24, cutLengthIn: 42.6, bendCount: 2, sheetCount: 2, utilization: 0.71, totalCents: 41_866, status: 'ready', createdAt: '2026-09-04T14:22:00Z' },
    { id: 'q_2417', reference: 'Q-2026-2417', materialId: 'mat_ms_14', materialName: 'Mild steel — 14 ga', filename: 'gusset-plate.dxf', quantity: 120, cutLengthIn: 18.4, bendCount: 0, sheetCount: 3, utilization: 0.88, totalCents: 62_140, status: 'ordered', createdAt: '2026-09-03T09:05:00Z' },
    { id: 'q_2416', reference: 'Q-2026-2416', materialId: 'mat_al5052_125', materialName: 'Aluminium 5052 — 0.125"', filename: 'enclosure-lid.dxf', quantity: 8, cutLengthIn: 96.2, bendCount: 4, sheetCount: 2, utilization: 0.42, totalCents: 38_910, status: 'ready', createdAt: '2026-09-02T16:40:00Z' },
    { id: 'q_2415', reference: 'Q-2026-2415', materialId: 'mat_ms_14', materialName: 'Mild steel — 14 ga', filename: 'shim-0p075.dxf', quantity: 4, cutLengthIn: 6.1, bendCount: 0, sheetCount: 1, utilization: 0.04, totalCents: 7_500, status: 'expired', createdAt: '2026-08-28T11:12:00Z' },
    { id: 'q_2414', reference: 'Q-2026-2414', materialId: 'mat_al6061_090', materialName: 'Aluminium 6061 — 0.090"', filename: 'chassis-side-a.dxf', quantity: 32, cutLengthIn: 61.9, bendCount: 3, sheetCount: 4, utilization: 0.79, totalCents: 128_420, status: 'ordered', createdAt: '2026-08-26T08:55:00Z' },
    { id: 'q_2413', reference: 'Q-2026-2413', materialId: 'mat_ss304_16', materialName: 'Stainless 304 — 16 ga', filename: 'vent-panel.dxf', quantity: 16, cutLengthIn: 143.7, bendCount: 1, sheetCount: 2, utilization: 0.63, totalCents: 74_308, status: 'ready', createdAt: '2026-08-24T13:30:00Z' },
    { id: 'q_2412', reference: 'Q-2026-2412', materialId: 'mat_ms_14', materialName: 'Mild steel — 14 ga', filename: 'bracket-l-small.dxf', quantity: 60, cutLengthIn: 12.8, bendCount: 1, sheetCount: 1, utilization: 0.91, totalCents: 28_755, status: 'draft', createdAt: '2026-08-21T10:02:00Z' },
  ]);

  /**
   * Loading / error / empty are design states a reviewer has to judge, so each gets a
   * URL: ?state=loading | error | empty. Default (absent) renders the populated list.
   */
  readonly state = this.params.read<ViewState>('state', 'ready', VIEW_STATES);
  readonly loading = computed(() => this.state() === 'loading');
  readonly error = computed(() =>
    this.state() === 'error' ? 'The quotes service did not respond. Please try again.' : null,
  );

  readonly page = this.params.readNumber('page', 1);
  readonly sort = this.params.read<Sort>('sort', 'newest', SORTS);
  readonly money = centsToUsd;

  readonly sorted = computed(() => {
    if (this.state() === 'empty') return [];
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

  setSort(event: Event): void {
    this.params.patch({ sort: (event.target as HTMLSelectElement).value, page: 1 });
  }

  go(page: number): void {
    this.params.patch({ page: Math.min(Math.max(1, page), this.pageCount()) });
  }

  retry(): void {
    this.params.patch({ state: null });
  }

  statusClass(status: QuoteStatus): string {
    if (status === 'ordered') return 'badge--success';
    if (status === 'ready') return 'badge--info';
    if (status === 'expired') return 'badge--danger';
    return '';
  }
}
