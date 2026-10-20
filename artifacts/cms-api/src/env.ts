// Every setting the API reads from the environment, validated once at boot so
// a missing secret fails loudly at startup instead of at the first request.

import { z } from 'zod';

const bool = z
  .string()
  .optional()
  .transform((value) => value === 'true' || value === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().default('127.0.0.1'),
  PUBLIC_SITE_URL: z.string().url().default('http://localhost:3000'),
  ADMIN_URL: z.string().url().optional(),
  CORS_ORIGINS: z.string().default(''),
  APP_SECRET: z
    .string()
    .min(32, 'APP_SECRET must be at least 32 characters')
    .refine((value) => value !== 'change-me', 'Set APP_SECRET to a random value'),
  // Unset: Secure cookies whenever the public site is served over https.
  COOKIE_SECURE: z.enum(['true', 'false', '1', '0']).optional(),
  SESSION_DAYS: z.coerce.number().int().min(1).max(90).default(14),

  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  UPLOAD_DIR: z.string().default('./uploads'),
  MAX_UPLOAD_MB: z.coerce.number().positive().max(2048).default(100),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_PUBLIC_URL: z.string().optional(),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: bool,
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().default('Veyra <no-reply@localhost>'),

  RECAPTCHA_SECRET: z.string().optional(),
  RECAPTCHA_MIN_SCORE: z.coerce.number().min(0).max(1).default(0.5),

  SITE_DIST: z.string().optional(),
  ADMIN_DIST: z.string().optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`).join('\n');
  console.error(`[config] invalid environment:\n${issues}`);
  process.exit(1);
}

const raw = parsed.data;

if (raw.STORAGE_DRIVER === 's3' && (!raw.S3_BUCKET || !raw.S3_REGION)) {
  console.error('[config] STORAGE_DRIVER=s3 needs S3_BUCKET and S3_REGION');
  process.exit(1);
}

const siteUrl = raw.PUBLIC_SITE_URL.replace(/\/+$/, '');

export const env = {
  ...raw,
  isProd: raw.NODE_ENV === 'production',
  siteUrl,
  adminUrl: (raw.ADMIN_URL ?? `${siteUrl}/admin`).replace(/\/+$/, ''),
  cookieSecure: raw.COOKIE_SECURE === undefined ? siteUrl.startsWith('https://') : raw.COOKIE_SECURE === 'true' || raw.COOKIE_SECURE === '1',
  corsOrigins: raw.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean),
  maxUploadBytes: Math.round(raw.MAX_UPLOAD_MB * 1024 * 1024),
};
