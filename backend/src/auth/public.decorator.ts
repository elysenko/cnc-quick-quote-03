import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'colossus:isPublic';

/** Opt a route out of JwtAuthGuard (login, signup, health, branding, webhook). */
export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC_KEY, true);
