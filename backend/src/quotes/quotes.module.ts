import { Module } from '@nestjs/common';
import { QuotesController } from './quotes.controller';
import { QuotesService } from './quotes.service';
import { NestingService } from './nesting.service';
import { PricingService } from './pricing.service';

@Module({
  controllers: [QuotesController],
  providers: [QuotesService, NestingService, PricingService],
  exports: [QuotesService, NestingService, PricingService],
})
export class QuotesModule {}
