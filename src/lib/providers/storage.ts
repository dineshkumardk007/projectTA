import 'server-only';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { env } from '@/lib/env';

/**
 * Object storage abstraction for shop and product imagery.
 *
 * The local provider writes into `public/uploads` so development needs no cloud
 * account. The S3 shape is defined here so switching is configuration, not a
 * refactor.
 */

export type StoredObject = {
  key: string;
  /** Publicly reachable URL for `<img src>`. */
  url: string;
};

export interface StorageProvider {
  readonly name: string;
  put(input: { body: Buffer; contentType: string; folder: string; filename: string }): Promise<StoredObject>;
  delete(key: string): Promise<void>;
}

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

export function assertUploadableImage(contentType: string, sizeBytes: number) {
  if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
    throw new Error('Only JPEG, PNG, WebP or AVIF images can be uploaded.');
  }
  if (sizeBytes > 5 * 1024 * 1024) {
    throw new Error('Images must be smaller than 5 MB.');
  }
}

function safeKey(folder: string, filename: string): string {
  const ext = path.extname(filename).toLowerCase().replace(/[^.a-z0-9]/g, '') || '.jpg';
  const cleanFolder = folder.replace(/[^a-z0-9/-]/gi, '');
  return `${cleanFolder}/${crypto.randomBytes(12).toString('hex')}${ext}`;
}

export class LocalStorageProvider implements StorageProvider {
  readonly name = 'local';

  private readonly root = path.join(process.cwd(), 'public', 'uploads');

  async put(input: { body: Buffer; contentType: string; folder: string; filename: string }): Promise<StoredObject> {
    assertUploadableImage(input.contentType, input.body.byteLength);
    const key = safeKey(input.folder, input.filename);
    const target = path.join(this.root, key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, input.body);
    return { key, url: `/uploads/${key}` };
  }

  async delete(key: string): Promise<void> {
    const target = path.join(this.root, key);
    // Never let a crafted key escape the uploads directory.
    if (!target.startsWith(this.root)) throw new Error('Invalid storage key.');
    await fs.rm(target, { force: true });
  }
}
export class S3StorageProvider implements StorageProvider {
  readonly name = 's3';

  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicBaseUrl: string;

  constructor(config: {
    endpoint?: string;
    region?: string;
    bucket: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    publicBaseUrl?: string;
  }) {
    if (!config.bucket) {
      throw new Error('S3StorageProvider requires S3_BUCKET environment variable.');
    }

    this.bucket = config.bucket;

    const credentials =
      config.accessKeyId && config.secretAccessKey
        ? {
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
          }
        : undefined;

    this.client = new S3Client({
      region: config.region || 'auto',
      endpoint: config.endpoint || undefined,
      credentials,
    });

    if (config.publicBaseUrl) {
      this.publicBaseUrl = config.publicBaseUrl.replace(/\/+$/, '');
    } else if (config.endpoint) {
      const cleanEndpoint = config.endpoint.replace(/\/+$/, '');
      this.publicBaseUrl = `${cleanEndpoint}/${this.bucket}`;
    } else {
      const region = config.region || 'us-east-1';
      this.publicBaseUrl = `https://${this.bucket}.s3.${region}.amazonaws.com`;
    }
  }

  async put(input: { body: Buffer; contentType: string; folder: string; filename: string }): Promise<StoredObject> {
    assertUploadableImage(input.contentType, input.body.byteLength);
    const key = safeKey(input.folder, input.filename);

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: input.body,
        ContentType: input.contentType,
      }),
    );

    return {
      key,
      url: `${this.publicBaseUrl}/${key}`,
    };
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
  }
}

let cached: StorageProvider | null = null;

export function getStorageProvider(): StorageProvider {
  if (cached) return cached;
  cached =
    env.STORAGE_PROVIDER === 's3' && env.S3_BUCKET
      ? new S3StorageProvider({
          endpoint: env.S3_ENDPOINT,
          region: env.S3_REGION,
          bucket: env.S3_BUCKET,
          accessKeyId: env.S3_ACCESS_KEY_ID,
          secretAccessKey: env.S3_SECRET_ACCESS_KEY,
          publicBaseUrl: env.S3_PUBLIC_BASE_URL,
        })
      : new LocalStorageProvider();
  return cached;
}
