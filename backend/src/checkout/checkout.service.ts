import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StripeService } from '../integrations/stripe.service';
import { OrdersService } from './orders.service';

export interface CheckoutReview {
  quoteId: string;
  reference: string;
  filename: string;
  materialName: string;
  quantity: number;
  bendCount: number;
  sheetCount: number;
  totalCents: number;
}

export interface ShippingOption {
  id: string;
  name: string;
  description: string;
  baseRateCents: number;
  perSheetRateCents: number;
  rateCents: number;
  active: boolean;
  sortOrder: number;
}

export interface SessionRequest {
  shippingMethodId: string;
  recipient: string;
  line1: string;
  city: string;
  state: string;
  zip: string;
  origin: string;
}

/**
 * Checkout orchestration. No order row is written here — the order is created only
 * once Stripe confirms payment, via the webhook or the reconcile endpoint.
 */
@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
    private readonly orders: OrdersService,
  ) {}

  async review(userId: string, quoteId: string): Promise<CheckoutReview> {
    const quote = await this.ownedQuote(userId, quoteId);
    return {
      quoteId: quote.id,
      reference: quote.reference,
      filename: quote.filename,
      materialName: quote.materialName,
      quantity: quote.quantity,
      bendCount: quote.bendCount,
      sheetCount: quote.sheetCount,
      totalCents: quote.totalCents,
    };
  }

  /** 409 when the shop has no active delivery option — the UI shows contact-us. */
  async shippingMethods(userId: string, quoteId: string): Promise<ShippingOption[]> {
    const quote = await this.ownedQuote(userId, quoteId);
    const methods = await this.prisma.shippingMethod.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    if (methods.length === 0) {
      throw new ConflictException(
        'No delivery options are available right now. Please contact us to arrange this order.',
      );
    }
    return methods.map((method) => ({
      id: method.id,
      name: method.name,
      description: method.description,
      baseRateCents: method.baseRateCents,
      perSheetRateCents: method.perSheetRateCents,
      rateCents: method.baseRateCents + method.perSheetRateCents * quote.sheetCount,
      active: method.active,
      sortOrder: method.sortOrder,
    }));
  }

  async createSession(
    user: { id: string; email: string },
    quoteId: string,
    request: SessionRequest,
  ): Promise<{ url: string; sessionId: string }> {
    const quote = await this.ownedQuote(user.id, quoteId);
    const options = await this.shippingMethods(user.id, quoteId);
    const shipping = options.find((option) => option.id === request.shippingMethodId) ?? options[0];

    const origin = request.origin.replace(/\/$/, '');
    const session = await this.stripe.createCheckoutSession({
      customerEmail: user.email,
      lines: [
        {
          name: `${quote.materialName} — ${quote.quantity} × ${quote.filename}`,
          description: `Quote ${quote.reference}`,
          amountCents: quote.totalCents,
        },
        {
          name: `Shipping — ${shipping.name}`,
          description: shipping.description,
          amountCents: shipping.rateCents,
        },
      ].filter((line) => line.amountCents > 0),
      successUrl: `${origin}/#/order/confirmation/pending?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${origin}/#/checkout/${quote.id}/shipping?payment=cancelled`,
      metadata: {
        quoteId: quote.id,
        userId: user.id,
        shippingMethodId: shipping.id,
        shippingMethodName: shipping.name,
        shippingCents: String(shipping.rateCents),
        subtotalCents: String(quote.totalCents),
        recipient: request.recipient ?? '',
        line1: request.line1 ?? '',
        city: request.city ?? '',
        state: request.state ?? '',
        zip: request.zip ?? '',
      },
    });
    return { url: session.url, sessionId: session.id };
  }

  /**
   * Materialises the order from a paid session. Called by the webhook and by the
   * confirmation page when the webhook has not landed yet; both are idempotent.
   */
  async materialiseFromSession(
    sessionId: string,
    paymentStatus: string,
    paymentIntent: string | null,
    metadata: Record<string, string>,
  ): Promise<{ orderId: string; created: boolean } | null> {
    if (paymentStatus !== 'paid') {
      this.logger.warn(`Session ${sessionId} is not paid (${paymentStatus}) — no order created.`);
      return null;
    }
    const quoteId = metadata.quoteId;
    const userId = metadata.userId;
    if (!quoteId || !userId) {
      this.logger.error(`Session ${sessionId} has no quote/user metadata — cannot create an order.`);
      return null;
    }

    const quote = await this.prisma.quote.findUnique({ where: { id: quoteId } });
    if (!quote) {
      this.logger.error(`Session ${sessionId} references missing quote ${quoteId}.`);
      return null;
    }

    const shippingCents = Number(metadata.shippingCents ?? 0) || 0;
    const { order, created } = await this.orders.createIfAbsent({
      userId,
      quoteId,
      stripeSessionId: sessionId,
      stripePaymentIntent: paymentIntent,
      shippingMethodId: metadata.shippingMethodId || null,
      shippingMethodName: metadata.shippingMethodName || 'Shipping',
      shippingAddress: {
        recipient: metadata.recipient ?? '',
        line1: metadata.line1 ?? '',
        city: metadata.city ?? '',
        state: metadata.state ?? '',
        zip: metadata.zip ?? '',
      },
      subtotalCents: quote.totalCents,
      shippingCents,
      totalCents: quote.totalCents + shippingCents,
    });

    if (created) this.orders.queueConfirmationEmail(order.id);
    return { orderId: order.id, created };
  }

  private async ownedQuote(userId: string, quoteId: string) {
    const quote = await this.prisma.quote.findFirst({ where: { id: quoteId, userId } });
    if (!quote) throw new NotFoundException('That quote could not be found.');
    return quote;
  }
}
