import { NextResponse } from 'next/server';
import { env } from '@/lib/env';

export async function GET(request: Request) {
  if (!env.GOOGLE_CLIENT_ID) {
    return NextResponse.json({ error: 'Google Auth is not configured on this server.' }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const nextParam = searchParams.get('next') ?? '/';

  const host = request.headers.get('host') ?? 'localhost:3000';
  const protocol = request.headers.get('x-forwarded-proto') ?? (host.includes('localhost') ? 'http' : 'https');
  const redirectUri = `${protocol}://${host}/api/auth/google/callback`;

  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state: nextParam,
    prompt: 'select_account',
  });

  const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

  return NextResponse.redirect(googleAuthUrl);
}
