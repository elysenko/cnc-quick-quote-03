import { Controller, Headers, HttpCode, Logger, Post, Req } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type Stripe from 'stripe';
import { Public } from '../auth/public.decorator';
import { StripeService } from '../integrations/stripe.service';
import { CheckoutService } from './checkout.service';
import { OrdersService } from './orders.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Stripe webhook receiver.
 *
 * Public and never rate-limited — Stripe must always be able to deliver, and the
 * request authenticates itself by signature. A signature failure logs and returns
 * without touching a single row.
 */
@ApiTags('webhooks')
@Controller('api/webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private readonly stripe: StripeService,
    private readonly checkout: CheckoutService,
    private readonly orders: OrdersService,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @Post('stripe')
  @HttpCode(200)
  @ApiExcludeEndpoint()
  async stripeWebhook(
    @Req() request: Request & { rawBody?: Buffer },
    @Headers('stripe-signature') signature?: string,
  ): Promise<{ received: boolean; reason?: string }> {
    const rawBody = request.rawBody;
    if (!rawBody || !signature) {
      this.logger.warn('Stripe webhook without a raw body or signature — ignored.');
      return { received: false, reason: 'missing_signature' };
    }

    const event = await this.stripe.constructWebhookEvent(rawBody, signature);
    if (!event) {
      // Zero state change: no WebhookEvent row, no order.
      return { received: false, reason: 'invalid_signature' };
    }

    const alreadyProcessed = await this.prisma.webhookEvent.findUnique({
      where: { stripeEventId: event.id },
    });
    if (alreadyProcessed) {
      this.logger.log(`Stripe event ${event.id} already processed — replay ignored.`);
      return { received: true, reason: 'duplicate' };
    }

    // The WebhookEvent insert and any resulting Order creation run inside ONE
    // transaction: if the process dies after the event row commits but before the
    // order does, a replay would otherwise see "already processed" and skip creating
    // the order forever. Wrapping both writes together makes them atomic — either
    // this delivery produces both rows, or (on a unique-violation race / crash before
    // commit) neither, and a Stripe retry gets a clean second attempt.
    let orderResult: { orderId: string; created: boolean } | null;
    try {
      orderResult = await this.prisma.$transaction(async (tx) => {
        await tx.webhookEvent.create({
          data: {
            stripeEventId: event.id,
            type: event.type,
            payloadJson: { id: event.id, type: event.type },
          },
        });

        if (event.type === 'checkout.session.completed') {
          const session = event.data.object as Stripe.Checkout.Session;
          return this.checkout.materialiseFromSession(
            session.id,
            session.payment_status ?? 'unpaid',
            typeof session.payment_intent === 'string' ? session.payment_intent : null,
            (session.metadata ?? {}) as Record<string, string>,
            tx,
          );
        }
        return null;
      });
    } catch {
      // Unique violation on the event row — a concurrent delivery of the same event
      // won the race. The whole transaction rolled back (no partial order either).
      this.logger.log(`Stripe event ${event.id} raced a duplicate delivery — ignored.`);
      return { received: true, reason: 'duplicate' };
    }

    if (orderResult) {
      this.logger.log(
        `checkout.session.completed ${event.id} → ${orderResult.created ? 'order created' : 'order already existed'}`,
      );
      // The transaction has committed by now, so the order row is visible — safe to
      // queue the confirmation email (fire-and-forget; failure is logged, not thrown).
      if (orderResult.created) this.orders.queueConfirmationEmail(orderResult.orderId);
    }
    return { received: true };
  }
}
