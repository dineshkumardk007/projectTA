import { NextResponse } from 'next/server';
import { env } from '@/lib/env';

export function getRedirectUri(request: Request): string {
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'localhost:3000';
  const proto = request.headers.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https');
  
  if (env.NEXT_PUBLIC_APP_URL && !env.NEXT_PUBLIC_APP_URL.includes('localhost') && process.env.NODE_ENV === 'production') {
    return `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')}/api/auth/google/callback`;
  }
  return `${proto}://${host}/api/auth/google/callback`;
}

export async function GET(request: Request) {
  if (!env.GOOGLE_CLIENT_ID) {
    return NextResponse.json({ error: 'Google Auth is not configured on this server.' }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const nextParam = searchParams.get('next') ?? '/';
  const redirectUri = getRedirectUri(request);

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
