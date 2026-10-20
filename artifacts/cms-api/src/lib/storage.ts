// Where uploaded bytes live. "local" writes under UPLOAD_DIR and serves them
// at /uploads; "s3" works with AWS S3 or any S3-compatible store (Cloudflare
// R2, DigitalOcean Spaces, Backblaze B2). Switching is an env change.

import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { env } from '../env.ts';

export interface Storage {
  readonly driver: 'local' | 's3';
  put(key: string, body: Buffer, contentType: string): Promise<string>;
  remove(key: string): Promise<void>;
}

export const uploadRoot = path.resolve(env.UPLOAD_DIR);

class LocalStorage implements Storage {
  readonly driver = 'local' as const;

  private resolve(key: string) {
    const full = path.resolve(uploadRoot, key);
    // Keys are generated server-side, but never let one escape the upload dir.
    if (!full.startsWith(uploadRoot + path.sep)) throw new Error('Invalid storage key');
    return full;
  }

  async put(key: string, body: Buffer) {
    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, body);
    return `/uploads/${key}`;
  }

  async remove(key: string) {
    await rm(this.resolve(key), { force: true });
  }
}

class S3Storage implements Storage {
  readonly driver = 's3' as const;
  private client = new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT || undefined,
    forcePathStyle: Boolean(env.S3_ENDPOINT),
    credentials:
      env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
        ? { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY }
        : undefined,
  });

  private publicUrl(key: string) {
    const base = env.S3_PUBLIC_URL?.replace(/\/+$/, '') || `https://${env.S3_BUCKET}.s3.${env.S3_REGION}.amazonaws.com`;
    return `${base}/${key.split('/').map(encodeURIComponent).join('/')}`;
  }

  async put(key: string, body: Buffer, contentType: string) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
    return this.publicUrl(key);
  }

  async remove(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
  }
}

export const storage: Storage = env.STORAGE_DRIVER === 's3' ? new S3Storage() : new LocalStorage();

export function storageFor(driver: string): Storage | null {
  if (driver === storage.driver) return storage;
  return null;
}
