import { ChangeDetectionStrategy, Component, OnInit, computed, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Order, centsToUsd } from '../core/models';

@Component({
  selector: 'app-order-confirmation',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './order-confirmation.component.html',
  styleUrl: './order-confirmation.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderConfirmationComponent implements OnInit {
  readonly orderId = input<string>('ord_9f21');

  readonly orders = signal<Order[]>([
    { id: 'ord_9f21', orderNumber: 'ORD-2026-0912', confirmationNumber: 'CNF-7QX4-2M8D', customerName: 'Dana Ortiz', quoteReference: 'Q-2026-2418', materialName: 'Stainless 304 — 16 ga', quantity: 24, shippingMethod: 'Ground freight', subtotalCents: 41_866, shippingCents: 2_690, totalCents: 44_556, status: 'paid', placedAt: '2026-09-05T15:41:00Z' },
  ]);

  /** The webhook may lag the redirect, so the page reconciles the session first. */
  readonly reconciling = signal(true);
  readonly money = centsToUsd;

  readonly order = computed(
    () => this.orders().find((o) => o.id === this.orderId()) ?? this.orders()[0],
  );

  ngOnInit(): void {
    setTimeout(() => this.reconciling.set(false), 1100);
  }

  downloadReceipt(): void {
    window.print();
  }
}
