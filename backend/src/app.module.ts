import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { AppConfigModule } from './config/config.module';
import { SettingsModule } from './settings/settings.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { AuthModule } from './auth/auth.module';
import { DrawingsModule } from './drawings/drawings.module';
import { QuotesModule } from './quotes/quotes.module';
import { CheckoutModule } from './checkout/checkout.module';
import { AdminModule } from './admin/admin.module';
import { AccountModule } from './account/account.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';

/**
 * JwtAuthGuard is global: every route is authenticated unless it opts out with
 * @Public(). That default-deny ordering is what makes an unauthenticated hit on an
 * admin route answer 401 while an authenticated non-admin gets 403 from AdminGuard.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AppConfigModule,
    SettingsModule,
    IntegrationsModule,
    AuthModule,
    HealthModule,
    DrawingsModule,
    QuotesModule,
    CheckoutModule,
    AdminModule,
    AccountModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }],
})
export class AppModule {}
