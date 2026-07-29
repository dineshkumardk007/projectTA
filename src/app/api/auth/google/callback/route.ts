import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { setSessionCookie, signSession } from '@/lib/auth/session';
import { recordSignIn } from '@/lib/services/auth';

const HOME_BY_ROLE: Record<string, string> = {
  CUSTOMER: '/',
  MERCHANT: '/merchant',
  STAFF: '/merchant',
  ADMIN: '/admin',
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const state = searchParams.get('state');

  const host = request.headers.get('host') ?? 'localhost:3000';
  const protocol = request.headers.get('x-forwarded-proto') ?? (host.includes('localhost') ? 'http' : 'https');
  const appBaseUrl = `${protocol}://${host}`;
  const redirectUri = `${appBaseUrl}/api/auth/google/callback`;

  if (error || !code) {
    return NextResponse.redirect(`${appBaseUrl}/signin?error=google_auth_failed`);
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
      console.error('[Google OAuth] Token exchange failed:', await tokenResponse.text());
      return NextResponse.redirect(`${appBaseUrl}/signin?error=google_token_failed`);
    }

    const tokens = (await tokenResponse.json()) as { access_token?: string; id_token?: string };
    if (!tokens.access_token) {
      return NextResponse.redirect(`${appBaseUrl}/signin?error=google_token_missing`);
    }

    // 2. Fetch Google user profile
    const userinfoResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!userinfoResponse.ok) {
      return NextResponse.redirect(`${appBaseUrl}/signin?error=google_profile_failed`);
    }

    const profile = (await userinfoResponse.json()) as {
      sub: string;
      email: string;
      name?: string;
      picture?: string;
    };

    if (!profile.email) {
      return NextResponse.redirect(`${appBaseUrl}/signin?error=google_email_missing`);
    }

    // 3. Find or create user in Prisma
    let user = await db.user.findFirst({
      where: {
        OR: [{ googleId: profile.sub }, { email: profile.email }],
      },
    });

    if (user) {
      // Link googleId if missing
      if (!user.googleId) {
        user = await db.user.update({
          where: { id: user.id },
          data: { googleId: profile.sub },
        });
      }
    } else {
      // Create new customer account
      const displayName = profile.name || profile.email.split('@')[0] || 'User';
      user = await db.user.create({
        data: {
          name: displayName,
          email: profile.email,
          googleId: profile.sub,
          role: 'CUSTOMER',
          customerProfile: {
            create: {},
          },
        },
      });
    }

    if (!user.isActive) {
      return NextResponse.redirect(`${appBaseUrl}/signin?error=deactivated`);
    }

    // 4. Issue session cookie
    await setSessionCookie(
      await signSession({ sub: user.id, role: user.role, name: user.name, ver: user.tokenVersion }),
    );

    // 5. Record sign-in metrics asynchronously
    await recordSignIn(user.id, request).catch(() => null);

    // 6. Redirect user
    const safeNext = state?.startsWith('/') && !state.startsWith('//') ? state : null;
    const targetUrl = safeNext ?? HOME_BY_ROLE[user.role] ?? '/';

    return NextResponse.redirect(`${appBaseUrl}${targetUrl}`);
  } catch (err) {
    console.error('[Google OAuth] Callback handler error:', err);
    return NextResponse.redirect(`${appBaseUrl}/signin?error=google_auth_error`);
  }
}
