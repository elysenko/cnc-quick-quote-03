import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { AppConfigService } from '../config/config.service';
import { SettingsService } from '../settings/settings.service';
import { ServiceUnavailableError, ServiceUnconfiguredError } from '../common/errors';

const SERVICE = 'Stripe SDK (Python) + Stripe Checkout';
const CREDENTIAL_KEY = 'STRIPE_SDK_PYTHON_STRIPE_CHECKOUT_API_KEY';

export interface CheckoutLine {
  name: string;
  description: string;
  amountCents: number;
}

/**
 * Stripe Checkout Sessions and webhook verification.
 *
 * The secret key resolves env-first (`STRIPE_SECRET_KEY` /
 * `STRIPE_SDK_PYTHON_STRIPE_CHECKOUT_API_KEY`) and then falls back to the
 * administrator-saved, encrypted `payment` settings document. Unconfigured is a 503,
 * never a 500, and never a silently-faked session.
 */
@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);

  constructor(
    private readonly config: AppConfigService,
    private readonly settings: SettingsService,
  ) {}

  async secretKey(): Promise<string | null> {
    const fromEnv = await this.config.resolveFirst('STRIPE_SECRET_KEY', CREDENTIAL_KEY);
    if (fromEnv) return fromEnv;
    const payment = await this.settings.get('payment');
    return payment.stripeSecretKey || null;
  }

  async webhookSecret(): Promise<string | null> {
    const fromEnv = await this.config.resolveConfig('STRIPE_WEBHOOK_SECRET');
    if (fromEnv) return fromEnv;
    const payment = await this.settings.get('payment');
    return payment.stripeWebhookSecret || null;
  }

  async isConfigured(): Promise<boolean> {
    return (await this.secretKey()) !== null;
  }

  private async client(): Promise<Stripe> {
    const key = await this.secretKey();
    if (!key) throw new ServiceUnconfiguredError(SERVICE, CREDENTIAL_KEY);
    return new Stripe(key, { timeout: 12000, maxNetworkRetries: 1 });
  }

  async createCheckoutSession(params: {
    lines: CheckoutLine[];
    successUrl: string;
    cancelUrl: string;
    customerEmail: string;
    metadata: Record<string, string>;
  }): Promise<{ id: string; url: string }> {
    const stripe = await this.client();
    try {
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        customer_email: params.customerEmail,
        line_items: params.lines.map((line) => ({
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: line.amountCents,
            product_data: { name: line.name, description: line.description || undefined },
          },
        })),
        success_url: params.successUrl,
        cancel_url: params.cancelUrl,
        metadata: params.metadata,
      });
      if (!session.url) throw new Error('Stripe returned a session without a redirect URL');
      return { id: session.id, url: session.url };
    } catch (error) {
      this.logger.error(`Checkout session create failed: ${(error as Error).message}`);
      throw new ServiceUnavailableError(SERVICE, (error as Error).message);
    }
  }

  async retrieveSession(sessionId: string): Promise<Stripe.Checkout.Session> {
    const stripe = await this.client();
    try {
      return await stripe.checkout.sessions.retrieve(sessionId);
    } catch (error) {
      throw new ServiceUnavailableError(SERVICE, (error as Error).message);
    }
  }

  /**
   * Verifies the Stripe-Signature header against the raw request body.
   * Returns null on any signature failure — the caller logs and changes no state.
   */
  async constructWebhookEvent(rawBody: Buffer, signature: string): Promise<Stripe.Event | null> {
    const secret = await this.webhookSecret();
    if (!secret) {
      this.logger.warn('Stripe webhook received but no webhook secret is configured — ignoring.');
      return null;
    }
    try {
      const stripe = await this.client();
      return stripe.webhooks.constructEvent(rawBody, signature, secret);
    } catch (error) {
      this.logger.warn(`Stripe webhook signature rejected: ${(error as Error).message}`);
      return null;
    }
  }
}
