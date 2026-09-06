import { Module } from '@nestjs/common';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { WebhooksController } from './webhooks.controller';

@Module({
  controllers: [CheckoutController, OrdersController, WebhooksController],
  providers: [CheckoutService, OrdersService],
  exports: [CheckoutService, OrdersService],
})
export class CheckoutModule {}
