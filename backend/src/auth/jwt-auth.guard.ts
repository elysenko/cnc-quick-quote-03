import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from './public.decorator';
import { TokensService } from './tokens.service';
import { RedisService } from '../integrations/redis.service';
import type { AuthedUser } from './current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Missing, malformed, expired or denylisted token → 401.
 *
 * Runs before AdminGuard, which is what makes "unauthenticated is 401, authenticated
 * non-admin is 403" hold on every admin route.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokensService,
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: AuthedUser }>();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Sign in to continue.');
    }

    const claims = this.tokens.verifyAccess(header.slice('Bearer '.length).trim());
    if (!claims) throw new UnauthorizedException('Your session has expired. Please sign in again.');
    if (await this.redis.isDenylisted(claims.jti)) {
      throw new UnauthorizedException('This session was signed out.');
    }

    const user = await this.prisma.user.findUnique({ where: { id: claims.sub } });
    if (!user) throw new UnauthorizedException('This account no longer exists.');

    request.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      jti: claims.jti,
    };
    return true;
  }
}
