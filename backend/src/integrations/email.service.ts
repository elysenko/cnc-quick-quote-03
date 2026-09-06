import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';
import { AppConfigService } from '../config/config.service';
import { SettingsService } from '../settings/settings.service';

const CREDENTIAL_KEY = 'RESEND_PYTHON_SDK_API_KEY';

export interface OrderEmailPayload {
  to: string;
  customerName: string;
  orderNumber: string;
  confirmationNumber: string;
  materialName: string;
  quantity: number;
  shippingMethodName: string;
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
}

const usd = (cents: number): string => `$${(cents / 100).toFixed(2)}`;

/**
 * Transactional order confirmation.
 *
 * Deliberately failure-tolerant: an unconfigured key or a provider outage is logged
 * and swallowed, because the customer has already been charged and the order must
 * stand regardless of whether the receipt email leaves the building.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    private readonly config: AppConfigService,
    private readonly settings: SettingsService,
  ) {}

  async isConfigured(): Promise<boolean> {
    return (await this.config.resolveFirst('RESEND_API_KEY', CREDENTIAL_KEY)) !== null;
  }

  async sendOrderConfirmation(payload: OrderEmailPayload): Promise<boolean> {
    const apiKey = await this.config.resolveFirst('RESEND_API_KEY', CREDENTIAL_KEY);
    if (!apiKey) {
      this.logger.warn(
        `Order ${payload.orderNumber} confirmed but Resend is not configured — no email sent.`,
      );
      return false;
    }

    const business = await this.settings.get('business');
    const from =
      (await this.config.resolveConfig('RESEND_FROM_EMAIL')) ?? 'orders@resend.dev';

    try {
      const resend = new Resend(apiKey);
      const result = await resend.emails.send({
        from,
        to: payload.to,
        subject: `${business.companyName} — order ${payload.orderNumber} confirmed`,
        html: this.receiptHtml(payload, business.companyName),
      });
      if (result.error) throw new Error(result.error.message);
      this.logger.log(`Confirmation email sent for order ${payload.orderNumber}.`);
      return true;
    } catch (error) {
      this.logger.error(
        `Confirmation email for order ${payload.orderNumber} failed: ${(error as Error).message}`,
      );
      return false;
    }
  }

  receiptHtml(payload: OrderEmailPayload, companyName: string): string {
    return `<!doctype html><html><body style="font-family:system-ui,sans-serif;color:#111827">
  <h1 style="font-size:20px">Thank you — your order is confirmed</h1>
  <p>Hi ${escapeHtml(payload.customerName)}, we have your order and it is queued for cutting.</p>
  <table cellpadding="6" style="border-collapse:collapse;font-size:14px">
    <tr><td><strong>Order number</strong></td><td>${escapeHtml(payload.orderNumber)}</td></tr>
    <tr><td><strong>Confirmation</strong></td><td>${escapeHtml(payload.confirmationNumber)}</td></tr>
    <tr><td><strong>Material</strong></td><td>${escapeHtml(payload.materialName)}</td></tr>
    <tr><td><strong>Quantity</strong></td><td>${payload.quantity}</td></tr>
    <tr><td><strong>Shipping</strong></td><td>${escapeHtml(payload.shippingMethodName)}</td></tr>
    <tr><td><strong>Subtotal</strong></td><td>${usd(payload.subtotalCents)}</td></tr>
    <tr><td><strong>Shipping</strong></td><td>${usd(payload.shippingCents)}</td></tr>
    <tr><td><strong>Total paid</strong></td><td><strong>${usd(payload.totalCents)}</strong></td></tr>
  </table>
  <p style="color:#6b7280;font-size:12px">${escapeHtml(companyName)}</p>
</body></html>`;
  }
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
