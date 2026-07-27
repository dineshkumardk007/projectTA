import 'server-only';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import type { UserRole } from '@prisma/client';
import { env } from '@/lib/env';

/**
 * Sessions are stateless JWTs in an httpOnly cookie.
 *
 * The token carries only what authorisation checks need (`sub`, `role`, `ver`).
 * `ver` is compared against `User.tokenVersion` on every privileged read, so a
 * password change or a ban can invalidate every outstanding token without a
 * session table.
 */
export const SESSION_COOKIE = 'takeaway_session';

const secret = new TextEncoder().encode(env.AUTH_SECRET);

export type SessionClaims = {
  sub: string;
  role: UserRole;
  name: string;
  ver: number;
};

export async function signSession(claims: SessionClaims): Promise<string> {
  return new SignJWT({ role: claims.role, name: claims.name, ver: claims.ver })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${env.AUTH_SESSION_DAYS}d`)
    .sign(secret);
}

export async function verifySession(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] });
    if (typeof payload.sub !== 'string') return null;
    return {
      sub: payload.sub,
      role: payload.role as UserRole,
      name: (payload.name as string) ?? '',
      ver: (payload.ver as number) ?? 0,
    };
  } catch {
    return null;
  }
}

export async function setSessionCookie(token: string) {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: env.AUTH_SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function readSessionCookie(): Promise<SessionClaims | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
}
