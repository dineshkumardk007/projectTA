import 'server-only';
import { z } from 'zod';
import { appUrlSeverity, describeAppUrlProblem } from '@/lib/domain/public-url';
import { criticalProviders, describeProviders } from '@/lib/domain/provider-health';

/**
 * Validated server environment.
 *
 * Parsed once at module load so a misconfigured deployment fails immediately
 * and loudly, rather than at 8am when the first order comes in.
 */
const schema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  AUTH_SECRET: z
    .string()
    .min(32, 'AUTH_SECRET must be at least 32 characters — generate one with `openssl rand -base64 48`'),
  AUTH_SESSION_DAYS: z.coerce.number().int().positive().default(30),
  GOOGLE_CLIENT_ID: z.string().optional().default(''),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(''),

  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),

  MAPS_PROVIDER: z.enum(['haversine', 'google']).default('haversine'),
  MAPS_API_KEY: z.string().optional().default(''),

  PAYMENTS_PROVIDER: z.enum(['mock', 'razorpay']).default('mock'),
  RAZORPAY_KEY_ID: z.string().optional().default(''),
  RAZORPAY_KEY_SECRET: z.string().optional().default(''),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional().default(''),

  PUSH_PROVIDER: z.enum(['mock', 'webpush']).default('mock'),
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().optional().default(''),
  VAPID_PRIVATE_KEY: z.string().optional().default(''),
  VAPID_SUBJECT: z.string().optional().default('mailto:support@takeaway.example'),

  /**
   * Where merchants send their subscription and boost payments in Phase 1.
   *
   * Optional: with no VPA configured the merchant's billing screen shows the
   * support contact instead of a QR code. That is the right failure — a QR that
   * pays nobody is worse than no QR.
   */
  PLATFORM_UPI_ID: z.string().optional().default(''),
  PLATFORM_UPI_NAME: z.string().optional().default('Takeaway'),
  PLATFORM_SUPPORT_PHONE: z.string().optional().default(''),

  EMAIL_PROVIDER: z.enum(['console', 'resend']).default('console'),
  RESEND_API_KEY: z.string().optional().default(''),
  EMAIL_FROM: z.string().optional().default('Takeaway <no-reply@takeaway.example>'),

  STORAGE_PROVIDER: z.enum(['local', 's3']).default('local'),
  S3_ENDPOINT: z.string().optional().default(''),
  S3_REGION: z.string().optional().default(''),
  S3_BUCKET: z.string().optional().default(''),
  S3_ACCESS_KEY_ID: z.string().optional().default(''),
  S3_SECRET_ACCESS_KEY: z.string().optional().default(''),
  S3_PUBLIC_BASE_URL: z.string().optional().default(''),

  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  • ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Invalid environment configuration:\n${issues}\n\nSee .env.example.`);
}

export const env = parsed.data;

/**
 * The public address has to be reachable from a stranger's phone, because the
 * printed poster QR encodes it permanently. See `domain/public-url`.
 */
const appUrlProblem = describeAppUrlProblem(env.NEXT_PUBLIC_APP_URL, env.NODE_ENV);
if (appUrlProblem) {
  const detail =
    `${appUrlProblem}\n` +
    'This address is encoded permanently into printed shop QR posters and into password-reset links.';

  if (appUrlSeverity({ vercelEnv: process.env.VERCEL_ENV, deployed: process.env.DEPLOYED }) === 'fatal') {
    throw new Error(`Invalid production configuration:\n  • ${detail}`);
  }
  // A local production build testing over Wi-Fi is legitimate — say it loudly
  // and carry on rather than blocking the build.
  console.warn(`\n[env] WARNING: ${detail}\n`);
}

/** Real credentials missing → providers fall back to their mock implementation. */
export const providerReadiness = {
  maps: env.MAPS_PROVIDER === 'google' && env.MAPS_API_KEY.length > 0,
  payments: env.PAYMENTS_PROVIDER === 'razorpay' && env.RAZORPAY_KEY_ID.length > 0,
  push: env.PUSH_PROVIDER === 'webpush' && env.VAPID_PRIVATE_KEY.length > 0,
  storage: env.STORAGE_PROVIDER === 's3' && env.S3_BUCKET.length > 0,
  email: env.EMAIL_PROVIDER === 'resend' && env.RESEND_API_KEY.length > 0,
  googleAuth: env.GOOGLE_CLIENT_ID.length > 0 && env.GOOGLE_CLIENT_SECRET.length > 0,
  /** Can merchants be shown a "pay us" QR code yet? */
  platformBilling: env.PLATFORM_UPI_ID.length > 0,
};

/** A real deployment rather than a laptop. See `domain/public-url`. */
export const isDeployed = appUrlSeverity({
  vercelEnv: process.env.VERCEL_ENV,
  deployed: process.env.DEPLOYED,
}) === 'fatal';

/** Serverless hosting: read-only disk, discarded between requests. */
export const isServerless = Boolean(
  process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT,
);

/**
 * Says out loud, once at boot, which integrations will silently do nothing.
 *
 * These failures are invisible from inside the app — the email provider returns
 * success, the push provider reports delivery. Without this the first sign of
 * trouble is a customer who cannot get back into their account.
 */
const broken = criticalProviders(
  describeProviders({
    email: { configured: providerReadiness.email, value: env.EMAIL_PROVIDER },
    push: { configured: providerReadiness.push, value: env.PUSH_PROVIDER },
    storage: { configured: providerReadiness.storage, value: env.STORAGE_PROVIDER },
    payments: { configured: providerReadiness.payments, value: env.PAYMENTS_PROVIDER },
    maps: { configured: providerReadiness.maps, value: env.MAPS_PROVIDER },
    isDeployed,
    isServerless,
  }),
);

if (broken.length > 0) {
  console.warn(
    ['', '[env] These integrations are NOT configured and will fail silently:', ...broken.map((p) => `  • ${p.name}: ${p.consequence}`), ''].join('\n'),
  );
}
