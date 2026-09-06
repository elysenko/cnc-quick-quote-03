import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';
import { StorageService } from './storage.service';
import { StripeService } from './stripe.service';
import { EmailService } from './email.service';

/** One home for every outbound dependency, so credentials resolve in one place. */
@Global()
@Module({
  providers: [RedisService, StorageService, StripeService, EmailService],
  exports: [RedisService, StorageService, StripeService, EmailService],
})
export class IntegrationsModule {}
