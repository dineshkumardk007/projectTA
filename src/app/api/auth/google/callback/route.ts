import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { SESSION_COOKIE, signSession } from '@/lib/auth/session';
import { getRedirectUri } from '../login/route';

const HOME_BY_ROLE: Record<string, string> = {
  CUSTOMER: '/',
  MERCHANT: '/merchant',
  STAFF: '/merchant',
  ADMIN: '/admin',
};

const SAFE_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  tokenVersion: true,
} as const;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const state = searchParams.get('state');

  const redirectUri = getRedirectUri(request);
  const appBaseUrl = redirectUri.replace('/api/auth/google/callback', '');

  if (error || !code) {
    console.warn('[Google OAuth] OAuth code missing or error returned from Google:', error);
    return NextResponse.redirect(`${appBaseUrl}/signin?error=google_auth_failed&msg=${encodeURIComponent(error || 'No code returned')}`);
  }

  try {
    // 1. Exchange authorization code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      const errText = await tokenResponse.text();
      console.error('[Google OAuth] Token exchange failed with redirect_uri:', redirectUri, 'Error:', errText);
      return NextResponse.redirect(`${appBaseUrl}/signin?error=google_token_failed&msg=${encodeURIComponent(errText)}`);
    }

    const tokens = (await tokenResponse.json()) as { access_token?: string; id_token?: string };
    if (!tokens.access_token) {
      console.error('[Google OAuth] Access token missing in response');
      return NextResponse.redirect(`${appBaseUrl}/signin?error=google_token_missing`);
    }

    // 2. Fetch Google user profile
    const userinfoResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!userinfoResponse.ok) {
      console.error('[Google OAuth] Userinfo fetch failed');
      return NextResponse.redirect(`${appBaseUrl}/signin?error=google_profile_failed`);
    }

    const profile = (await userinfoResponse.json()) as {
      sub: string;
      email: string;
      name?: string;
      picture?: string;
    };

    if (!profile.email) {
      console.error('[Google OAuth] Profile email missing');
      return NextResponse.redirect(`${appBaseUrl}/signin?error=google_email_missing`);
    }

    // 3. User lookup by email using explicit select (prevents querying non-existent columns)
    let user = await db.user.findUnique({
      where: { email: profile.email },
      select: SAFE_USER_SELECT,
    });

    if (!user) {
      const displayName = profile.name || profile.email.split('@')[0] || 'User';
      user = await db.user.create({
        data: {
          name: displayName,
          email: profile.email,
          role: 'CUSTOMER',
          customerProfile: { create: {} },
        },
        select: SAFE_USER_SELECT,
      });
    }

    if (!user.isActive) {
      return NextResponse.redirect(`${appBaseUrl}/signin?error=deactivated`);
    }

    // 4. Create signed session JWT token
    const token = await signSession({
      sub: user.id,
      role: user.role,
      name: user.name,
      ver: user.tokenVersion,
    });

    // 5. Determine target redirect URL
    const safeNext = state?.startsWith('/') && !state.startsWith('//') ? state : null;
    const targetUrl = safeNext ?? HOME_BY_ROLE[user.role] ?? '/';

    // 6. Return redirect response with cookie directly set on headers
    const response = NextResponse.redirect(`${appBaseUrl}${targetUrl}`);

    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: env.AUTH_SESSION_DAYS * 24 * 60 * 60,
    });

    return response;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Google OAuth] Callback handler unexpected error:', err);
    return NextResponse.redirect(`${appBaseUrl}/signin?error=google_auth_error&msg=${encodeURIComponent(message)}`);
  }
}
