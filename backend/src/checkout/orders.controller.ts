import { Controller, Get, Header, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { OrderView, OrdersService } from './orders.service';
import { SettingsService } from '../settings/settings.service';
import { escapeHtml } from '../integrations/email.service';
import { CurrentUser, type AuthedUser } from '../auth/current-user.decorator';

const usd = (cents: number): string => `$${(cents / 100).toFixed(2)}`;

@ApiTags('orders')
@Controller('api/orders')
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly settings: SettingsService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthedUser): Promise<OrderView[]> {
    return this.orders.list(user.id);
  }

  @Get(':id')
  byId(@CurrentUser() user: AuthedUser, @Param('id') id: string): Promise<OrderView> {
    return this.orders.byId(user.id, id);
  }

  @Get(':id/receipt')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @ApiOperation({ summary: 'Printable HTML receipt for an order.' })
  async receipt(@CurrentUser() user: AuthedUser, @Param('id') id: string): Promise<string> {
    const order = await this.orders.byId(user.id, id);
    const business = await this.settings.get('business');
    const row = (label: string, value: string): string =>
      `<tr><th style="text-align:left;padding:6px 18px 6px 0">${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`;

    return `<!doctype html><html><head><meta charset="utf-8"><title>Receipt ${escapeHtml(order.orderNumber)}</title></head>
<body style="font-family:system-ui,sans-serif;color:#111827;max-width:640px;margin:40px auto">
  <h1 style="font-size:22px;margin-bottom:4px">${escapeHtml(business.companyName)}</h1>
  <p style="color:#6b7280;margin-top:0">Receipt for order ${escapeHtml(order.orderNumber)}</p>
  <table style="border-collapse:collapse;font-size:14px">
    ${row('Confirmation', order.confirmationNumber)}
    ${row('Quote', order.quoteReference)}
    ${row('Customer', order.customerName)}
    ${row('Material', order.materialName)}
    ${row('Quantity', String(order.quantity))}
    ${row('Shipping method', order.shippingMethod)}
    ${row('Subtotal', usd(order.subtotalCents))}
    ${row('Shipping', usd(order.shippingCents))}
    ${row('Total paid', usd(order.totalCents))}
    ${row('Placed', order.placedAt)}
  </table>
</body></html>`;
  }
}
