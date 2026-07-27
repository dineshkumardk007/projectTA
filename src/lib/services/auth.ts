import 'server-only';
import { cookies } from 'next/headers';
import { db } from '@/lib/db';
import { detectDeviceTypeFromRequest, type DeviceType } from '@/lib/domain/device';

/**
 * Sign-in and sign-out side effects.
 *
 * Sessions themselves stay stateless JWTs (`lib/auth/session`) — this module
 * only records *engagement*: how often an account comes back, on what, and for
 * how long. None of it is consulted for authorisation, so a failure here must
 * never stop someone signing in. Every function below swallows its own errors
 * for exactly that reason.
 */

/** Names the row in `UserSessionLog` this browser is currently filling in. */
const SESSION_LOG_COOKIE = 'takeaway_session_log';

/**
 * The longest a session is allowed to count for.
 *
 * Someone who signs in, walks away and closes the laptop generates a row that is
 * never closed. On the next sign-in it is closed at this cap rather than at
 * "now", so one abandoned tab cannot report a 40-hour session and drag every
 * average with it.
 */
const MAX_SESSION_SECONDS = 4 * 60 * 60;

export type SignInRecord = {
  userId: string;
  deviceType: DeviceType;
};

/**
 * Bumps the login counters and opens a session log row.
 *
 * Called after credentials are verified and the cookie is set, so a failed
 * sign-in never counts as a visit.
 */
export async function recordSignIn(userId: string, request: Request): Promise<void> {
  const deviceType = detectDeviceTypeFromRequest(request);

  try {
    await db.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date(), loginCount: { increment: 1 } },
    });
  } catch (error) {
    console.warn('[auth] could not update login counters', error);
  }

  try {
    // Close anything this account left hanging before opening a new row, so a
    // user cannot accumulate dozens of permanently-open sessions.
    await closeStaleSessions(userId);

    const log = await db.userSessionLog.create({
      data: { userId, deviceType },
      select: { id: true },
    });

    const store = await cookies();
    store.set(SESSION_LOG_COOKIE, log.id, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: MAX_SESSION_SECONDS,
    });
  } catch (error) {
    console.warn('[auth] could not open session log', error);
  }
}

/** Closes the session log row this browser opened, and clears its cookie. */
export async function recordSignOut(): Promise<void> {
  try {
    const store = await cookies();
    const logId = store.get(SESSION_LOG_COOKIE)?.value;
    store.delete(SESSION_LOG_COOKIE);
    if (!logId) return;

    const log = await db.userSessionLog.findUnique({
      where: { id: logId },
      select: { id: true, startedAt: true, endedAt: true },
    });
    if (!log || log.endedAt) return;

    const endedAt = new Date();
    const seconds = Math.min(
      MAX_SESSION_SECONDS,
      Math.max(0, Math.round((endedAt.getTime() - log.startedAt.getTime()) / 1000)),
    );

    await db.userSessionLog.update({
      where: { id: log.id },
      data: { endedAt, durationSeconds: seconds },
    });
  } catch (error) {
    console.warn('[auth] could not close session log', error);
  }
}

/**
 * Closes this user's abandoned rows at the cap.
 *
 * `durationSeconds` is set to the cap rather than the real elapsed time, and
 * that is the honest choice available: we know when they arrived and nothing
 * about when they left. Reporting reads closed rows only, so these land in the
 * numbers as "at least this long", never as a precise measurement.
 */
async function closeStaleSessions(userId: string): Promise<void> {
  const now = new Date();
  const open = await db.userSessionLog.findMany({
    where: { userId, endedAt: null },
    select: { id: true, startedAt: true },
    take: 50,
  });
  if (open.length === 0) return;

  await Promise.all(
    open.map((log) => {
      const elapsed = Math.round((now.getTime() - log.startedAt.getTime()) / 1000);
      const seconds = Math.min(MAX_SESSION_SECONDS, Math.max(0, elapsed));
      return db.userSessionLog.update({
        where: { id: log.id },
        data: { endedAt: new Date(log.startedAt.getTime() + seconds * 1000), durationSeconds: seconds },
      });
    }),
  );
}

export type EngagementSummary = {
  loginCount: number;
  lastLoginAt: Date | null;
  /** Sessions with a recorded end — the only ones whose length is known. */
  measuredSessions: number;
  totalSessionSeconds: number;
  averageSessionSeconds: number;
  /** Sessions still open, whose length is unknown and excluded from the totals. */
  openSessions: number;
  deviceBreakdown: { deviceType: string; count: number }[];
};

/** Everything the admin customer-detail page shows about how a person uses the app. */
export async function getEngagementSummary(userId: string): Promise<EngagementSummary> {
  const [user, closed, open, devices] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { loginCount: true, lastLoginAt: true } }),
    db.userSessionLog.aggregate({
      where: { userId, endedAt: { not: null } },
      _sum: { durationSeconds: true },
      _count: { _all: true },
    }),
    db.userSessionLog.count({ where: { userId, endedAt: null } }),
    db.userSessionLog.groupBy({
      by: ['deviceType'],
      where: { userId },
      _count: { _all: true },
    }),
  ]);

  const totalSeconds = closed._sum.durationSeconds ?? 0;
  const measured = closed._count._all;

  return {
    loginCount: user?.loginCount ?? 0,
    lastLoginAt: user?.lastLoginAt ?? null,
    measuredSessions: measured,
    totalSessionSeconds: totalSeconds,
    averageSessionSeconds: measured > 0 ? Math.round(totalSeconds / measured) : 0,
    openSessions: open,
    deviceBreakdown: devices.map((row) => ({ deviceType: row.deviceType, count: row._count._all })),
  };
}
