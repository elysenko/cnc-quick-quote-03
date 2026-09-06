import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../integrations/redis.service';
import { StorageService } from '../integrations/storage.service';

interface DependencyStatus {
  status: 'up' | 'down';
  detail: string;
}

@ApiTags('health')
@Controller('api/health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly storage: StorageService,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Liveness probe — does not touch any dependency.' })
  check(): { status: 'ok'; uptimeSeconds: number } {
    return { status: 'ok', uptimeSeconds: Math.round(process.uptime()) };
  }

  @Public()
  @Get('deep')
  @ApiOperation({ summary: 'Readiness probe — reports each dependency without leaking credentials.' })
  async deep(): Promise<{ status: 'ok' | 'degraded'; dependencies: Record<string, DependencyStatus> }> {
    const dependencies: Record<string, DependencyStatus> = {
      postgres: await this.checkPostgres(),
      redis: await this.checkRedis(),
      objectStorage: await this.checkStorage(),
    };
    // Postgres is the only hard dependency: the app cannot serve a request without it.
    const status = dependencies.postgres.status === 'up' ? 'ok' : 'degraded';
    return { status, dependencies };
  }

  private async checkPostgres(): Promise<DependencyStatus> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'up', detail: 'query ok' };
    } catch (error) {
      return { status: 'down', detail: (error as Error).message };
    }
  }

  private async checkRedis(): Promise<DependencyStatus> {
    const ok = await this.redis.ping();
    return ok
      ? { status: 'up', detail: 'ping ok' }
      : { status: 'down', detail: 'not configured — using in-process rate limiting' };
  }

  private async checkStorage(): Promise<DependencyStatus> {
    const result = await this.storage.ping();
    return result.ok ? { status: 'up', detail: result.detail } : { status: 'down', detail: result.detail };
  }
}
