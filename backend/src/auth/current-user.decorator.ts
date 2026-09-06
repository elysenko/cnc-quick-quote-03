import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import type { Request } from 'express';

export interface AuthedUser {
  id: string;
  email: string;
  name: string | null;
  role: 'USER' | 'MANAGER' | 'ADMIN';
  jti: string;
}

/** Populated by JwtAuthGuard. Present on every non-@Public handler. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthedUser =>
    (ctx.switchToHttp().getRequest<Request & { user: AuthedUser }>()).user,
);
