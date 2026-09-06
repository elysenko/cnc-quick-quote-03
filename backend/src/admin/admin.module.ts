import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminServicesController } from './services.controller';
import { CheckoutModule } from '../checkout/checkout.module';

@Module({
  imports: [CheckoutModule],
  controllers: [AdminController, AdminServicesController],
})
export class AdminModule {}
