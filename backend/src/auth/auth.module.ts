import { Global, Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokensService } from './tokens.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AdminGuard } from './admin.guard';

@Global()
@Module({
  controllers: [AuthController],
  providers: [AuthService, TokensService, JwtAuthGuard, AdminGuard],
  exports: [AuthService, TokensService, JwtAuthGuard, AdminGuard],
})
export class AuthModule {}
