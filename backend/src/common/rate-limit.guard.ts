import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { RedisService } from '../integrations/redis.service';
import type { AuthedUser } from '../auth/current-user.decorator';

const WINDOW_SECONDS = 60;
const MAX_REQUESTS = 60;

/**
 * Fixed-window limiter keyed on the authenticated user, falling back to client IP.
 *
 * Backed by Redis INCR/EXPIRE where available and an in-process window otherwise, so
 * a missing Redis degrades the limit rather than opening the door or 503-ing the app.
 * The Stripe webhook route never mounts this guard — Stripe must always be able to
 * deliver, and it is already authenticated by signature.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(private readonly redis: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request & { user?: AuthedUser }>();
    const identity = request.user?.id ?? request.ip ?? 'anonymous';
    const bucket = `${request.method}:${request.route?.path ?? request.path}`;
    const windowStart = Math.floor(Date.now() / (WINDOW_SECONDS * 1000));
    const key = `ratelimit:${bucket}:${identity}:${windowStart}`;

    const hits = await this.redis.incrWithExpiry(key, WINDOW_SECONDS);
    if (hits > MAX_REQUESTS) {
      const retryAfter = WINDOW_SECONDS - Math.floor((Date.now() / 1000) % WINDOW_SECONDS);
      http.getResponse<Response>().setHeader('Retry-After', String(retryAfter));
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'rate_limited',
          message: 'Too many requests. Please wait a moment and try again.',
          retryAfter,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
