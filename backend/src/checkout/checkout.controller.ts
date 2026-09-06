import { Body, Controller, Get, NotFoundException, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CheckoutReview, CheckoutService, ShippingOption } from './checkout.service';
import { OrderView, OrdersService } from './orders.service';
import { StripeService } from '../integrations/stripe.service';
import { CurrentUser, type AuthedUser } from '../auth/current-user.decorator';
import { RateLimitGuard } from '../common/rate-limit.guard';

export class CreateSessionDto {
  shippingMethodId!: string;
  recipient!: string;
  line1!: string;
  city!: string;
  state!: string;
  zip!: string;
}

@ApiTags('checkout')
@Controller('api/checkout')
@UseGuards(RateLimitGuard)
export class CheckoutController {
  constructor(
    private readonly checkout: CheckoutService,
    private readonly orders: OrdersService,
    private readonly stripe: StripeService,
  ) {}

  @Get(':quoteId/review')
  review(
    @CurrentUser() user: AuthedUser,
    @Param('quoteId') quoteId: string,
  ): Promise<CheckoutReview> {
    return this.checkout.review(user.id, quoteId);
  }

  @Get(':quoteId/shipping-methods')
  @ApiOperation({ summary: 'Active delivery options with per-sheet rates for this quote.' })
  shippingMethods(
    @CurrentUser() user: AuthedUser,
    @Param('quoteId') quoteId: string,
  ): Promise<ShippingOption[]> {
    return this.checkout.shippingMethods(user.id, quoteId);
  }

  @Post(':quoteId/session')
  @ApiOperation({ summary: 'Create a Stripe Checkout Session. 503 if Stripe is unreachable.' })
  createSession(
    @CurrentUser() user: AuthedUser,
    @Param('quoteId') quoteId: string,
    @Body() body: CreateSessionDto,
    @Req() request: Request,
  ): Promise<{ url: string; sessionId: string }> {
    const origin =
      (request.headers.origin as string | undefined) ??
      process.env.FRONTEND_URL ??
      `${request.protocol}://${request.get('host') ?? 'localhost'}`;
    return this.checkout.createSession(user, quoteId, { ...body, origin });
  }

  /**
   * The success redirect races the webhook. This pulls the session straight from
   * Stripe so the confirmation page resolves even when the webhook is late.
   */
  @Post('reconcile/:sessionId')
  async reconcile(
    @CurrentUser() user: AuthedUser,
    @Param('sessionId') sessionId: string,
  ): Promise<OrderView> {
    const existing = await this.orders.bySessionId(user.id, sessionId);
    if (existing) return existing;

    const session = await this.stripe.retrieveSession(sessionId);
    const result = await this.checkout.materialiseFromSession(
      session.id,
      session.payment_status ?? 'unpaid',
      typeof session.payment_intent === 'string' ? session.payment_intent : null,
      (session.metadata ?? {}) as Record<string, string>,
    );
    if (!result) {
      throw new NotFoundException('That payment has not completed yet. Please wait a moment and refresh.');
    }
    return this.orders.byId(user.id, result.orderId);
  }
}
