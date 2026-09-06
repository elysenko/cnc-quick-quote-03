import { ConflictException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import type { Role, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../integrations/redis.service';
import { REFRESH_TTL_SECONDS, TokensService } from './tokens.service';

const BCRYPT_ROUNDS = 10;

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; name: string; role: Role; createdAt: string };
}

/**
 * Registration, sign-in and rotating refresh sessions.
 *
 * Password hashing is bcryptjs at 10 rounds — the same library and cost the
 * platform seed uses, so a Colossus-minted login verifies here unchanged.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokensService,
    private readonly redis: RedisService,
  ) {}

  async register(name: string, email: string, password: string): Promise<AuthResult> {
    const normalized = email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email: normalized } });
    if (existing) throw new ConflictException('An account with that email address already exists.');

    // First account on an empty instance owns the admin console.
    const isFirstUser = (await this.prisma.user.count()) === 0;
    const user = await this.prisma.user.create({
      data: {
        email: normalized,
        name: name.trim() || normalized,
        passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
        role: isFirstUser ? 'ADMIN' : 'USER',
      },
    });
    return this.issue(user);
  }

  async login(email: string, password: string): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    // Same message and roughly the same work either way — no account enumeration.
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('That email address and password do not match.');
    }
    return this.issue(user);
  }

  /** Rotates: the presented token is revoked and a fresh pair is minted. */
  async refresh(refreshToken: string): Promise<AuthResult> {
    const claims = this.tokens.verifyRefresh(refreshToken);
    if (!claims) throw new UnauthorizedException('Your session has expired. Please sign in again.');

    const row = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.tokens.hashToken(refreshToken) },
    });
    if (!row || row.revokedAt !== null || row.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Your session has expired. Please sign in again.');
    }

    const user = await this.prisma.user.findUnique({ where: { id: row.userId } });
    if (!user) throw new UnauthorizedException('This account no longer exists.');

    await this.prisma.refreshToken.update({
      where: { id: row.id },
      data: { revokedAt: new Date() },
    });
    return this.issue(user);
  }

  async logout(refreshToken: string | undefined, accessJti: string): Promise<void> {
    if (refreshToken) {
      await this.prisma.refreshToken
        .updateMany({
          where: { tokenHash: this.tokens.hashToken(refreshToken), revokedAt: null },
          data: { revokedAt: new Date() },
        })
        .catch((error: Error) => this.logger.warn(`Refresh revoke failed: ${error.message}`));
    }
    await this.redis.denylistJti(accessJti, REFRESH_TTL_SECONDS);
  }

  private async issue(user: User): Promise<AuthResult> {
    const jti = this.tokens.newJti();
    const refreshJti = this.tokens.newJti();
    const accessToken = this.tokens.signAccess({
      sub: user.id,
      email: user.email,
      role: user.role,
      jti,
    });
    const refreshToken = this.tokens.signRefresh({ sub: user.id, jti: refreshJti });

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.tokens.hashToken(refreshToken),
        jti: refreshJti,
        expiresAt: new Date(Date.now() + REFRESH_TTL_SECONDS * 1000),
      },
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name ?? user.email,
        role: user.role,
        createdAt: user.createdAt.toISOString(),
      },
    };
  }
}
