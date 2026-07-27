import 'server-only';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { AuthorizationError } from '@/lib/auth/guards';
import { logger } from '@/lib/logger';
import { env } from '@/lib/env';

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
    try {
      return await handler(...args);
    } catch (error) {
      return handleApiError(error);
    }
  };
}

/**
 * In-memory fixed-window rate limiter.
 *
 * Deliberately simple: it protects sign-in and order placement on a single
 * instance. A multi-instance deployment should swap the map for Redis — the
 * call sites do not change.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

/**
 * Expired windows are swept periodically. Without this the map grows by one
 * entry per unique IP+action for the life of the process — a slow but real leak
 * on a long-running server, since keys include client IPs and user ids.
 */
const SWEEP_INTERVAL_MS = 5 * 60_000;
let lastSweepAt = Date.now();

function sweepExpired(now: number) {
  if (now - lastSweepAt < SWEEP_INTERVAL_MS) return;
  lastSweepAt = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  sweepExpired(now);
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }

  bucket.count += 1;
  if (bucket.count > limit) {
    const seconds = Math.ceil((bucket.resetAt - now) / 1000);
    throw new DomainError(`Too many attempts. Please wait ${seconds}s and try again.`, 429, 'rate_limited');
  }
}

/** Best-effort client identity for rate limiting. */
export function clientKey(request: Request, suffix: string): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() || 'local';
  return `${ip}:${suffix}`;
}
