import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { decryptSecret, encryptSecret, maskSecret } from '../config/secrets';
import {
  DEFAULTS,
  DOC_NAMES,
  DocName,
  PAYMENT_SECRET_FIELDS,
  SettingsDocs,
} from './settings.defaults';

const DOC_PREFIX = 'doc.';

type Json = Record<string, unknown>;

/**
 * Typed read/write over the `system_settings` key/value table.
 *
 * A document read merges the stored JSON over the built-in defaults, so a missing
 * row is not an error and a partially-saved document never loses fields.
 */
@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async get<K extends DocName>(name: K): Promise<SettingsDocs[K]> {
    const row = await this.prisma.systemSetting.findUnique({
      where: { key: `${DOC_PREFIX}${name}` },
    });
    const defaults = DEFAULTS[name] as unknown as Json;
    if (!row) return { ...defaults } as unknown as SettingsDocs[K];

    let stored: Json = {};
    try {
      stored = JSON.parse(row.value) as Json;
    } catch {
      this.logger.warn(`Settings document "${name}" is not valid JSON; using defaults.`);
      return { ...defaults } as unknown as SettingsDocs[K];
    }

    if (name === 'payment') {
      for (const field of PAYMENT_SECRET_FIELDS) {
        const value = stored[field];
        if (typeof value === 'string' && value) {
          stored[field] = decryptSecret(value) ?? '';
        }
      }
    }
    return { ...defaults, ...stored } as unknown as SettingsDocs[K];
  }

  /** Merge-patch a document. Unknown keys are rejected so typos are visible. */
  async update<K extends DocName>(name: K, patch: Json): Promise<SettingsDocs[K]> {
    const defaults = DEFAULTS[name] as unknown as Json;
    const unknown = Object.keys(patch).filter((key) => !(key in defaults));
    if (unknown.length > 0) {
      throw new BadRequestException(`Unknown setting(s) for "${name}": ${unknown.join(', ')}`);
    }

    const current = (await this.get(name)) as unknown as Json;
    const merged: Json = { ...current, ...patch };

    const toStore: Json = { ...merged };
    if (name === 'payment') {
      for (const field of PAYMENT_SECRET_FIELDS) {
        const incoming = patch[field];
        // An empty string means "leave the stored secret alone".
        const value = typeof incoming === 'string' && incoming ? incoming : (current[field] as string);
        toStore[field] = value ? encryptSecret(value) : '';
      }
    }

    await this.prisma.systemSetting.upsert({
      where: { key: `${DOC_PREFIX}${name}` },
      update: { value: JSON.stringify(toStore), secret: name === 'payment' },
      create: { key: `${DOC_PREFIX}${name}`, value: JSON.stringify(toStore), secret: name === 'payment' },
    });
    return merged as unknown as SettingsDocs[K];
  }

  /** Payment document with every secret replaced by a mask. Safe for any GET. */
  async getPaymentMasked(): Promise<Record<string, unknown>> {
    const doc = await this.get('payment');
    return {
      sandbox: doc.sandbox,
      publishableKey: doc.publishableKey,
      stripeSecretKeyMasked: maskSecret(doc.stripeSecretKey || null),
      stripeWebhookSecretMasked: maskSecret(doc.stripeWebhookSecret || null),
    };
  }

  /** Only what an unauthenticated visitor may see: branding for the shell. */
  async getPublicBusiness(): Promise<Record<string, string>> {
    const business = await this.get('business');
    return {
      companyName: business.companyName,
      tagline: business.tagline,
      logoInitials: business.logoInitials,
      primaryColor: business.primaryColor,
      accentColor: business.accentColor,
    };
  }

  isDocName(value: string): value is DocName {
    return (DOC_NAMES as string[]).includes(value);
  }
}
