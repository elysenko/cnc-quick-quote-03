import { Injectable, Logger } from '@nestjs/common';
import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { AppConfigService } from '../config/config.service';
import { ServiceUnavailableError, ServiceUnconfiguredError } from '../common/errors';

const SERVICE = 'MinIO via boto3 (S3 API)';
const CREDENTIAL_KEY = 'MINIO_VIA_BOTO3_S3_API_API_KEY';
export const DRAWINGS_BUCKET = 'drawings';

/**
 * S3-compatible object storage for uploaded DXF files.
 *
 * Endpoint and credentials come from the pod environment (`MINIO_ENDPOINT`,
 * `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`), with the pipeline's synthetic
 * `MINIO_VIA_BOTO3_S3_API_API_KEY` accepted as an `access:secret` override an
 * administrator can paste into Admin → Services. Nothing is hardcoded.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private client: S3Client | null = null;
  private bucketReady = false;

  constructor(private readonly config: AppConfigService) {}

  async isConfigured(): Promise<boolean> {
    return (await this.credentials()) !== null;
  }

  private async credentials(): Promise<{
    endpoint: string;
    accessKeyId: string;
    secretAccessKey: string;
    region: string;
  } | null> {
    const endpoint = await this.config.resolveFirst('MINIO_ENDPOINT', 'S3_ENDPOINT');
    if (!endpoint) return null;

    let accessKeyId = await this.config.resolveFirst('MINIO_ROOT_USER', 'MINIO_ACCESS_KEY', 'AWS_ACCESS_KEY_ID');
    let secretAccessKey = await this.config.resolveFirst(
      'MINIO_ROOT_PASSWORD',
      'MINIO_SECRET_KEY',
      'AWS_SECRET_ACCESS_KEY',
    );

    // Admin-supplied single-field override, stored as "accessKey:secretKey".
    const combined = await this.config.resolveConfig(CREDENTIAL_KEY);
    if (combined && combined.includes(':')) {
      const separator = combined.indexOf(':');
      accessKeyId = combined.slice(0, separator);
      secretAccessKey = combined.slice(separator + 1);
    }

    if (!accessKeyId || !secretAccessKey) return null;
    return {
      endpoint,
      accessKeyId,
      secretAccessKey,
      region: (await this.config.resolveConfig('MINIO_REGION')) ?? 'us-east-1',
    };
  }

  private async s3(): Promise<S3Client> {
    const credentials = await this.credentials();
    if (!credentials) throw new ServiceUnconfiguredError(SERVICE, CREDENTIAL_KEY);
    if (!this.client) {
      this.client = new S3Client({
        endpoint: credentials.endpoint,
        region: credentials.region,
        forcePathStyle: true,
        credentials: {
          accessKeyId: credentials.accessKeyId,
          secretAccessKey: credentials.secretAccessKey,
        },
      });
    }
    return this.client;
  }

  private async ensureBucket(client: S3Client): Promise<void> {
    if (this.bucketReady) return;
    try {
      await client.send(new HeadBucketCommand({ Bucket: DRAWINGS_BUCKET }));
    } catch {
      try {
        await client.send(new CreateBucketCommand({ Bucket: DRAWINGS_BUCKET }));
        this.logger.log(`Created object storage bucket "${DRAWINGS_BUCKET}".`);
      } catch (error) {
        // A concurrent boot may have won the race; a later put will surface any real failure.
        this.logger.warn(`Could not create bucket "${DRAWINGS_BUCKET}": ${(error as Error).message}`);
      }
    }
    this.bucketReady = true;
  }

  async putDrawing(key: string, body: Buffer, contentType = 'application/dxf'): Promise<void> {
    const client = await this.s3();
    await this.ensureBucket(client);
    try {
      await client.send(
        new PutObjectCommand({ Bucket: DRAWINGS_BUCKET, Key: key, Body: body, ContentType: contentType }),
      );
    } catch (error) {
      throw new ServiceUnavailableError(SERVICE, (error as Error).message);
    }
  }

  async getDrawing(key: string): Promise<Buffer> {
    const client = await this.s3();
    try {
      const result = await client.send(new GetObjectCommand({ Bucket: DRAWINGS_BUCKET, Key: key }));
      const bytes = await result.Body?.transformToByteArray();
      if (!bytes) throw new Error('empty object body');
      return Buffer.from(bytes);
    } catch (error) {
      throw new ServiceUnavailableError(SERVICE, (error as Error).message);
    }
  }

  /** Used by /api/health/deep. Never throws — reports status instead. */
  async ping(): Promise<{ ok: boolean; detail: string }> {
    try {
      const client = await this.s3();
      await this.ensureBucket(client);
      await client.send(new HeadBucketCommand({ Bucket: DRAWINGS_BUCKET }));
      return { ok: true, detail: 'bucket reachable' };
    } catch (error) {
      if (error instanceof ServiceUnconfiguredError) return { ok: false, detail: 'not configured' };
      return { ok: false, detail: (error as Error).message };
    }
  }
}
