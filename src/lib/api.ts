import 'server-only';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { AuthorizationError } from '@/lib/auth/guards';
import { logger } from '@/lib/logger';
import { env } from '@/lib/env';
import { db } from '@/lib/db';

/**
 * Shared API plumbing.
 *
 * Two rules it exists to enforce:
 *  1. Clients receive a human-readable `error` string, never a stack trace or a
 *     database message.
 *  2. Expected failures (validation, authorisation, business rules) are
 *     distinguishable from bugs — only the latter are logged as errors.
 */

/** A business-rule failure that is safe (and useful) to show the user. */
export class DomainError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export function ok<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function fail(message: string, status = 400, code?: string) {
  return NextResponse.json({ error: message, code }, { status });
}

export function handleApiError(error: unknown) {
  if (error instanceof ZodError) {
    const first = error.issues[0];
    return fail(first?.message ?? 'Please check the details you entered.', 422, 'validation');
  }
  if (error instanceof AuthorizationError) {
    return fail(error.message, error.status, 'authorization');
  }
  if (error instanceof DomainError) {
    return fail(error.message, error.status, error.code);
  }

  logger.error('[api] unhandled error', error);
  return fail('Something went wrong on our side. Please try again.', 500, 'internal');
}

/** Validates request origin on state-modifying HTTP methods to prevent CSRF. */
export function validateSameOrigin(request: Request): void {
  const method = request.method.toUpperCase();
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return;

  const origin = request.headers.get('origin');
  if (!origin) return;

  try {
    const originUrl = new URL(origin);
    const appUrl = new URL(env.NEXT_PUBLIC_APP_URL);
    if (originUrl.host !== appUrl.host) {
      throw new DomainError('Cross-origin request rejected.', 403, 'csrf_violation');
    }
  } catch (err) {
    if (err instanceof DomainError) throw err;
    throw new DomainError('Invalid request origin.', 403, 'csrf_violation');
  }
}

/** Wraps a route handler so every throw becomes a clean JSON response. */
export function route<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    // Throttled to once every ten minutes and never awaited, so clearing out
    // expired counters cannot delay a response.
    sweepRateLimits();
    try {
      return await handler(...args);
    } catch (error) {
      return handleApiError(error);
    }
  };
}

/**
 * Fixed-window rate limiter, shared across server instances.
 *
 * The counter lives in the database rather than in process memory. On
 * serverless hosting each instance has its own memory, so an in-process map
 * turns "ten attempts a minute" into ten *per instance* — an allowance that
 * grows as the platform scales, which is precisely backwards for a limit whose
 * job is to survive an attack.
 *
 * The increment is a single statement. Read-then-write would let two concurrent
 * requests both read `count = 9` and both proceed, which under credential
 * stuffing is the only case that matters.
 */
export async function rateLimit(key: string, limit: number, windowMs: number): Promise<void> {
  const resetAt = new Date(Date.now() + windowMs);

  let rows: { count: number; resetAt: Date }[];
  try {
    // The CASE arms are what make an expired window reset itself: the same
    // statement that increments a live window restarts a dead one, so no
    // separate expiry pass can race with a request.
    rows = await db.$queryRaw<{ count: number; resetAt: Date }[]>`
      INSERT INTO "RateLimit" ("key", "count", "resetAt")
      VALUES (${key}, 1, ${resetAt})
      ON CONFLICT ("key") DO UPDATE SET
        "count"   = CASE WHEN "RateLimit"."resetAt" <= NOW() THEN 1 ELSE "RateLimit"."count" + 1 END,
        "resetAt" = CASE WHEN "RateLimit"."resetAt" <= NOW() THEN ${resetAt} ELSE "RateLimit"."resetAt" END
      RETURNING "count", "resetAt"
    `;
  } catch (error) {
    /**
     * Fail open, loudly.
     *
     * Every endpoint behind this limiter needs the database for its actual work,
     * so a database that cannot count is a database that cannot sign anyone in
     * either — refusing here would convert an outage into a second, more
     * confusing outage without protecting anything.
     */
    logger.error('[rate-limit] counter unavailable, allowing request', error);
    return;
  }

  const row = rows[0];
  if (!row || row.count <= limit) return;

  const seconds = Math.max(1, Math.ceil((row.resetAt.getTime() - Date.now()) / 1000));
  throw new DomainError(`Too many attempts. Please wait ${seconds}s and try again.`, 429, 'rate_limited');
}

/**
 * Drops windows that have already expired.
 *
 * Rows are only ever read by key, so leftovers cost storage rather than
 * correctness — hence a periodic sweep rather than a delete on every request.
 * Called opportunistically; failure is ignored.
 */
const SWEEP_INTERVAL_MS = 10 * 60_000;
let lastSweepAt = 0;

export function sweepRateLimits(): void {
  const now = Date.now();
  if (now - lastSweepAt < SWEEP_INTERVAL_MS) return;
  lastSweepAt = now;

  void db.rateLimit
    .deleteMany({ where: { resetAt: { lt: new Date() } } })
    .catch((error) => logger.warn('[rate-limit] sweep failed', error));
}

/** Best-effort client identity for rate limiting. */
export function clientKey(request: Request, suffix: string): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() || 'local';
  return `${ip}:${suffix}`;
}
