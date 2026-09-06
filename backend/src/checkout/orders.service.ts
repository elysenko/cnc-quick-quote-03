import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { Order, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../integrations/email.service';

export interface OrderView {
  id: string;
  orderNumber: string;
  confirmationNumber: string;
  customerName: string;
  quoteReference: string;
  materialName: string;
  quantity: number;
  shippingMethod: string;
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  status: 'paid' | 'in_production' | 'shipped' | 'cancelled';
  placedAt: string;
}

export interface CreateOrderInput {
  userId: string;
  quoteId: string;
  stripeSessionId: string;
  stripePaymentIntent: string | null;
  shippingMethodId: string | null;
  shippingMethodName: string;
  shippingAddress: Record<string, unknown>;
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
}

const CONFIRMATION_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Order creation is idempotent on `stripeSessionId`. Both the webhook and the
 * post-redirect reconcile call land here, and whichever arrives second returns the
 * existing row instead of failing — the customer is charged once, so the order exists once.
 */
@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  async createIfAbsent(input: CreateOrderInput): Promise<{ order: Order; created: boolean }> {
    const existing = await this.prisma.order.findUnique({
      where: { stripeSessionId: input.stripeSessionId },
    });
    if (existing) return { order: existing, created: false };

    try {
      const order = await this.prisma.$transaction(async (tx) => {
        const created = await tx.order.create({
          data: {
            userId: input.userId,
            quoteId: input.quoteId,
            orderNumber: await this.nextOrderNumber(),
            confirmationNumber: this.newConfirmationNumber(),
            stripeSessionId: input.stripeSessionId,
            stripePaymentIntent: input.stripePaymentIntent,
            shippingMethodId: input.shippingMethodId,
            shippingMethodName: input.shippingMethodName,
            shippingAddressJson: input.shippingAddress as unknown as Prisma.InputJsonValue,
            subtotalCents: input.subtotalCents,
            shippingCents: input.shippingCents,
            totalCents: input.totalCents,
            status: 'paid',
          },
        });
        await tx.quote.update({ where: { id: input.quoteId }, data: { status: 'ordered' } });
        return created;
      });
      return { order, created: true };
    } catch (error) {
      // Unique violation: the other path won the race. That is success, not failure.
      const again = await this.prisma.order.findUnique({
        where: { stripeSessionId: input.stripeSessionId },
      });
      if (again) return { order: again, created: false };
      throw error;
    }
  }

  /** Fire-and-forget: a failed send is logged, never propagated into the order path. */
  queueConfirmationEmail(orderId: string): void {
    void this.sendConfirmation(orderId).catch((error: Error) =>
      this.logger.error(`Confirmation email task failed: ${error.message}`),
    );
  }

  private async sendConfirmation(orderId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { user: true, quote: true },
    });
    if (!order) return;
    await this.email.sendOrderConfirmation({
      to: order.user.email,
      customerName: order.user.name ?? order.user.email,
      orderNumber: order.orderNumber,
      confirmationNumber: order.confirmationNumber,
      materialName: order.quote.materialName,
      quantity: order.quote.quantity,
      shippingMethodName: order.shippingMethodName,
      subtotalCents: order.subtotalCents,
      shippingCents: order.shippingCents,
      totalCents: order.totalCents,
    });
  }

  async list(userId: string): Promise<OrderView[]> {
    const orders = await this.prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { user: true, quote: true },
      take: 200,
    });
    return orders.map((order) => this.toView(order));
  }

  async listAll(): Promise<OrderView[]> {
    const orders = await this.prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
      include: { user: true, quote: true },
      take: 500,
    });
    return orders.map((order) => this.toView(order));
  }

  async byId(userId: string | null, id: string): Promise<OrderView> {
    const order = await this.prisma.order.findFirst({
      where: userId ? { id, userId } : { id },
      include: { user: true, quote: true },
    });
    if (!order) throw new NotFoundException('That order could not be found.');
    return this.toView(order);
  }

  async bySessionId(userId: string, sessionId: string): Promise<OrderView | null> {
    const order = await this.prisma.order.findFirst({
      where: { stripeSessionId: sessionId, userId },
      include: { user: true, quote: true },
    });
    return order ? this.toView(order) : null;
  }

  toView(
    order: Order & {
      user: { name: string | null; email: string };
      quote: { reference: string; materialName: string; quantity: number };
    },
  ): OrderView {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      confirmationNumber: order.confirmationNumber,
      customerName: order.user.name ?? order.user.email,
      quoteReference: order.quote.reference,
      materialName: order.quote.materialName,
      quantity: order.quote.quantity,
      shippingMethod: order.shippingMethodName,
      subtotalCents: order.subtotalCents,
      shippingCents: order.shippingCents,
      totalCents: order.totalCents,
      status: order.status as OrderView['status'],
      placedAt: order.createdAt.toISOString(),
    };
  }

  private async nextOrderNumber(): Promise<string> {
    const year = new Date().getUTCFullYear();
    const count = await this.prisma.order.count();
    for (let attempt = 0; attempt < 50; attempt++) {
      const candidate = `ORD-${year}-${String(count + 1 + attempt).padStart(4, '0')}`;
      const clash = await this.prisma.order.findUnique({ where: { orderNumber: candidate } });
      if (!clash) return candidate;
    }
    return `ORD-${year}-${Date.now().toString(36).toUpperCase()}`;
  }

  private newConfirmationNumber(): string {
    const group = (): string =>
      Array.from(randomBytes(4))
        .map((byte) => CONFIRMATION_ALPHABET[byte % CONFIRMATION_ALPHABET.length])
        .join('');
    return `CNF-${group()}-${group()}`;
  }
}
