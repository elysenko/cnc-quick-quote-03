import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { decryptSecret } from './secrets';

/** Scaffolder-written stand-in that means "still unset". Treated as absent. */
export const PLACEHOLDER = 'PLACEHOLDER_CONFIGURE_IN_SETTINGS';

const isUsable = (value: string | undefined | null): value is string =>
  typeof value === 'string' && value.trim() !== '' && value.trim() !== PLACEHOLDER;

/**
 * Single resolution path for every credential: environment first, then the
 * `SystemSetting` row an administrator saved, then null.
 *
 * Returning null (rather than throwing) is deliberate — callers decide whether the
 * absence is fatal (ServiceUnconfiguredError → 503) or merely degrades a feature.
 */
@Injectable()
export class AppConfigService {
  private readonly logger = new Logger(AppConfigService.name);

  constructor(private readonly prisma: PrismaService) {}

  async resolveConfig(key: string): Promise<string | null> {
    const fromEnv = process.env[key];
    if (isUsable(fromEnv)) return fromEnv.trim();

    try {
      const row = await this.prisma.systemSetting.findUnique({ where: { key } });
      if (!row) return null;
      const value = row.secret ? decryptSecret(row.value) : row.value;
      if (value === null) {
        // APP_SECRET rotated: the stored ciphertext is unreadable. Fall back to env.
        this.logger.warn(`Stored value for ${key} could not be decrypted; falling back to environment.`);
        return null;
      }
      return isUsable(value) ? value : null;
    } catch (error) {
      this.logger.warn(`Could not read setting ${key}: ${(error as Error).message}`);
      return null;
    }
  }

  /** First non-null of several candidate keys — used where a service has aliases. */
  async resolveFirst(...keys: string[]): Promise<string | null> {
    for (const key of keys) {
      const value = await this.resolveConfig(key);
      if (value !== null) return value;
    }
    return null;
  }
}
