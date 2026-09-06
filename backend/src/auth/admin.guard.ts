import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthedUser } from './current-user.decorator';

/** Authenticated but not an ADMIN → 403. Unauthenticated already failed at 401. */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthedUser }>();
    if (request.user?.role !== 'ADMIN') {
      throw new ForbiddenException('Administrator access is required for this area.');
    }
    return true;
  }
}
