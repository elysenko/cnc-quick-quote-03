import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import * as jwt from 'jsonwebtoken';

export const ACCESS_TTL_SECONDS = 15 * 60;
export const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;

export interface AccessClaims {
  sub: string;
  email: string;
  role: string;
  jti: string;
  typ: 'access';
}

export interface RefreshClaims {
  sub: string;
  jti: string;
  typ: 'refresh';
}

/**
 * JWT minting/verification and refresh-token hashing.
 *
 * Refresh tokens are only ever stored as a SHA-256 hash, so a database dump cannot
 * be replayed as a session.
 */
@Injectable()
export class TokensService {
  private secret(): string {
    return process.env.JWT_SECRET ?? process.env.APP_SECRET ?? 'colossus-development-secret';
  }

  newJti(): string {
    return randomUUID();
  }

  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  signAccess(payload: Omit<AccessClaims, 'typ'>): string {
    return jwt.sign({ ...payload, typ: 'access' }, this.secret(), {
      expiresIn: ACCESS_TTL_SECONDS,
    });
  }

  signRefresh(payload: Omit<RefreshClaims, 'typ'>): string {
    return jwt.sign({ ...payload, typ: 'refresh' }, this.secret(), {
      expiresIn: REFRESH_TTL_SECONDS,
    });
  }

  /** Returns null for any invalid/expired/wrong-type token — callers answer 401. */
  verifyAccess(token: string): AccessClaims | null {
    try {
      const claims = jwt.verify(token, this.secret()) as AccessClaims;
      return claims.typ === 'access' ? claims : null;
    } catch {
      return null;
    }
  }

  verifyRefresh(token: string): RefreshClaims | null {
    try {
      const claims = jwt.verify(token, this.secret()) as RefreshClaims;
      return claims.typ === 'refresh' ? claims : null;
    } catch {
      return null;
    }
  }
}
