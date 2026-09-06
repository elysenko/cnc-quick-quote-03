import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Order, centsToUsd } from '../core/models';
import { ApiService } from '../core/api.service';

const POLL_INTERVAL_MS = 2000;
const MAX_ATTEMPTS = 30;

@Component({
  selector: 'app-order-confirmation',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './order-confirmation.component.html',
  styleUrl: './order-confirmation.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderConfirmationComponent implements OnInit {
  readonly orderId = input<string>('');

  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  private readonly loaded = signal<Order | null>(null);
  private timer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Stripe's redirect can beat its own webhook, so the page holds the "finalising"
   * state and reconciles the session directly until the order exists. The template
   * only dereferences `order()` inside the `@else` branch, which `reconciling()`
   * guards, so the non-null assertion is safe.
   */
  readonly reconciling = signal(true);
  readonly order = computed(() => this.loaded()!);
  readonly money = centsToUsd;

  ngOnInit(): void {
    this.destroyRef.onDestroy(() => {
      if (this.timer) clearTimeout(this.timer);
    });
    void this.resolve(0);
  }

  private async resolve(attempt: number): Promise<void> {
    const sessionId = this.route.snapshot.queryParamMap.get('session_id');
    const id = this.orderId();

    try {
      // A concrete order id is the settled case; a session id means we may be racing
      // the webhook, and reconcile creates the order from Stripe if it has not landed.
      const order = sessionId ? await this.api.reconcile(sessionId) : await this.api.order(id);
      this.loaded.set(order);
      this.reconciling.set(false);
      return;
    } catch {
      /* fall through to retry */
    }

    if (attempt + 1 >= MAX_ATTEMPTS) return;
    this.timer = setTimeout(() => void this.resolve(attempt + 1), POLL_INTERVAL_MS);
  }

  /** Opens the server-rendered receipt so the browser's own print dialog can save it. */
  downloadReceipt(): void {
    const order = this.loaded();
    if (!order) return;
    void this.api.receiptHtml(order.id).then((html) => {
      const printWindow = window.open('', '_blank');
      if (!printWindow) return;
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();
      printWindow.print();
    });
  }
}
