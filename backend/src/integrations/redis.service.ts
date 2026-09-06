import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { AppConfigService } from '../config/config.service';

/**
 * Redis is used for two non-authoritative jobs: rate-limit counters and a
 * refresh-token JTI denylist. Both degrade safely — when Redis is unconfigured or
 * unreachable the limiter falls back to an in-process window and revocation still
 * works because `refresh_tokens.revoked_at` in Postgres remains the source of truth.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private initialised = false;
  private readonly memoryWindows = new Map<string, { count: number; expiresAt: number }>();
  private readonly memoryDenylist = new Map<string, number>();

  constructor(private readonly config: AppConfigService) {}

  async onModuleDestroy(): Promise<void> {
    if (this.client) await this.client.quit().catch(() => undefined);
  }

  /** null when Redis is not configured — callers use their in-process fallback. */
  private async connection(): Promise<Redis | null> {
    if (this.initialised) return this.client;
    this.initialised = true;
    const url = await this.config.resolveFirst('REDIS_URL', 'REDIS_API_KEY');
    if (!url) {
      this.logger.warn('Redis is not configured — using an in-process rate-limit window.');
      return null;
    }
    try {
      this.client = new Redis(url, { maxRetriesPerRequest: 1, lazyConnect: true });
      this.client.on('error', (error) => this.logger.warn(`Redis error: ${error.message}`));
      await this.client.connect();
      this.logger.log('Redis connected.');
    } catch (error) {
      this.logger.warn(`Redis unavailable (${(error as Error).message}) — using in-process fallback.`);
      this.client = null;
    }
    return this.client;
  }

  async ping(): Promise<boolean> {
    const client = await this.connection();
    if (!client) return false;
    try {
      return (await client.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  get configured(): boolean {
    return this.client !== null;
  }

  /** Fixed-window counter: returns the hit count for the current window. */
  async incrWithExpiry(key: string, ttlSeconds: number): Promise<number> {
    const client = await this.connection();
    if (client) {
      try {
        const count = await client.incr(key);
        if (count === 1) await client.expire(key, ttlSeconds);
        return count;
      } catch (error) {
        this.logger.warn(`Redis INCR failed (${(error as Error).message}); falling back.`);
      }
    }
    return this.memoryIncr(key, ttlSeconds);
  }

  private memoryIncr(key: string, ttlSeconds: number): number {
    const now = Date.now();
    const existing = this.memoryWindows.get(key);
    if (!existing || existing.expiresAt <= now) {
      this.memoryWindows.set(key, { count: 1, expiresAt: now + ttlSeconds * 1000 });
      if (this.memoryWindows.size > 5000) this.pruneWindows(now);
      return 1;
    }
    existing.count += 1;
    return existing.count;
  }

  private pruneWindows(now: number): void {
    for (const [key, window] of this.memoryWindows) {
      if (window.expiresAt <= now) this.memoryWindows.delete(key);
    }
  }

  async denylistJti(jti: string, ttlSeconds: number): Promise<void> {
    const client = await this.connection();
    if (client) {
      try {
        await client.set(`denylist:${jti}`, '1', 'EX', ttlSeconds);
        return;
      } catch (error) {
        this.logger.warn(`Redis denylist write failed: ${(error as Error).message}`);
      }
    }
    this.memoryDenylist.set(jti, Date.now() + ttlSeconds * 1000);
  }

  async isDenylisted(jti: string): Promise<boolean> {
    const client = await this.connection();
    if (client) {
      try {
        return (await client.exists(`denylist:${jti}`)) === 1;
      } catch (error) {
        this.logger.warn(`Redis denylist read failed: ${(error as Error).message}`);
      }
    }
    const expiry = this.memoryDenylist.get(jti);
    if (expiry === undefined) return false;
    if (expiry <= Date.now()) {
      this.memoryDenylist.delete(jti);
      return false;
    }
    return true;
  }
}
