import { BadRequestException, Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from '../auth/admin.guard';
import { AppConfigService } from '../config/config.service';
import { encryptSecret, maskSecret } from '../config/secrets';
import { PrismaService } from '../prisma/prisma.service';

interface CatalogEntry {
  id: string;
  name: string;
  kind: 'backing service' | 'integration';
  envKeys: string[];
  description: string;
  secret: boolean;
}

export interface ServiceStatus extends Omit<CatalogEntry, 'secret'> {
  maskedValue: string | null;
  configured: boolean;
}

/**
 * The credential catalogue behind Admin → Services.
 *
 * Every entry resolves through AppConfigService, so the `configured` badge reflects
 * exactly what the running code will find: environment first, admin override second.
 */
const CATALOG: CatalogEntry[] = [
  {
    id: 'postgresql-svc',
    name: 'PostgreSQL',
    kind: 'backing service',
    envKeys: ['DATABASE_URL'],
    description: 'Primary datastore for users, drawings, quotes and orders.',
    secret: true,
  },
  {
    id: 'minio-svc',
    name: 'MinIO',
    kind: 'backing service',
    envKeys: ['MINIO_ENDPOINT'],
    description: 'Object storage bucket "drawings" holding every uploaded DXF.',
    secret: false,
  },
  {
    id: 'minio-boto3',
    name: 'MinIO via boto3 (S3 API)',
    kind: 'integration',
    envKeys: ['MINIO_VIA_BOTO3_S3_API_API_KEY'],
    description: 'S3-compatible credentials ("accessKey:secretKey") for CAD drawing storage.',
    secret: true,
  },
  {
    id: 'postgresql',
    name: 'PostgreSQL',
    kind: 'integration',
    envKeys: ['POSTGRESQL_API_KEY'],
    description: 'Connection health probe backing /api/health/deep.',
    secret: true,
  },
  {
    id: 'redis',
    name: 'Redis',
    kind: 'integration',
    envKeys: ['REDIS_URL'],
    description: 'Rate-limit counters and the refresh-token revocation denylist.',
    secret: true,
  },
  {
    id: 'resend',
    name: 'Resend Python SDK',
    kind: 'integration',
    envKeys: ['RESEND_PYTHON_SDK_API_KEY'],
    description: 'Transactional order-confirmation email with receipt.',
    secret: true,
  },
  {
    id: 'stripe',
    name: 'Stripe SDK (Python) + Stripe Checkout',
    kind: 'integration',
    envKeys: ['STRIPE_SDK_PYTHON_STRIPE_CHECKOUT_API_KEY'],
    description: 'Hosted card payment and signature-verified webhooks.',
    secret: true,
  },
  {
    id: 'ezdxf',
    name: 'ezdxf',
    kind: 'integration',
    envKeys: ['EZDXF_API_KEY'],
    description: 'DXF geometry parsing — runs in-process, listed here for configuration parity.',
    secret: false,
  },
];

const ALLOWED_KEYS = new Set(CATALOG.flatMap((entry) => entry.envKeys));
const SECRET_KEYS = new Set(CATALOG.filter((e) => e.secret).flatMap((entry) => entry.envKeys));

@ApiTags('admin')
@Controller('api/admin/services')
@UseGuards(AdminGuard)
export class AdminServicesController {
  constructor(
    private readonly config: AppConfigService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Credential status per backing service and integration.' })
  async list(): Promise<{ services: ServiceStatus[]; integrations: ServiceStatus[] }> {
    const resolved = await Promise.all(
      CATALOG.map(async (entry) => {
        const value = await this.config.resolveFirst(...entry.envKeys);
        const status: ServiceStatus = {
          id: entry.id,
          name: entry.name,
          kind: entry.kind,
          envKeys: entry.envKeys,
          description: entry.description,
          // Secrets are masked; non-secret values (an endpoint URL) show as-is.
          maskedValue: value ? (entry.secret ? maskSecret(value) : value) : null,
          configured: value !== null,
        };
        return status;
      }),
    );
    return {
      services: resolved.filter((entry) => entry.kind === 'backing service'),
      integrations: resolved.filter((entry) => entry.kind === 'integration'),
    };
  }

  @Patch()
  @ApiOperation({ summary: 'Save credentials. Secret values are encrypted at rest.' })
  async update(@Body() body: Record<string, string>): Promise<{ ok: true }> {
    const entries = Object.entries(body ?? {});
    if (entries.length === 0) throw new BadRequestException('No credentials supplied.');

    const unknown = entries.map(([key]) => key).filter((key) => !ALLOWED_KEYS.has(key));
    if (unknown.length > 0) {
      throw new BadRequestException(`Unknown credential key(s): ${unknown.join(', ')}`);
    }

    for (const [key, raw] of entries) {
      const value = String(raw ?? '').trim();
      if (!value) continue; // blank means "leave whatever is stored alone"
      const secret = SECRET_KEYS.has(key);
      const stored = secret ? encryptSecret(value) : value;
      await this.prisma.systemSetting.upsert({
        where: { key },
        update: { value: stored, secret },
        create: { key, value: stored, secret },
      });
    }
    return { ok: true };
  }
}
