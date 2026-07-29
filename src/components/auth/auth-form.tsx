'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, FieldError, Input, Label, PasswordInput } from '@/components/ui/primitives';

/**
 * Sign-in / sign-up form.
 *
 * On success it routes by role, so a merchant who signs in from the customer
 * screen still lands on their order board rather than a shop list.
 */

const HOME_BY_ROLE: Record<string, string> = {
  CUSTOMER: '/',
  MERCHANT: '/merchant',
  STAFF: '/merchant',
  ADMIN: '/admin',
};

type Mode = 'signin' | 'signup';

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [accountType, setAccountType] = React.useState<'CUSTOMER' | 'MERCHANT'>('CUSTOMER');

  const nextParam = searchParams.get('next');

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const payload =
      mode === 'signin'
        ? { email: form.get('email'), password: form.get('password') }
        : {
            name: form.get('name'),
            email: form.get('email'),
            phone: form.get('phone'),
            password: form.get('password'),
            accountType,
            businessName: accountType === 'MERCHANT' ? form.get('businessName') : undefined,
          };

    try {
      const response = await fetch(`/api/auth/${mode === 'signin' ? 'login' : 'register'}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = (await response.json()) as { role?: string; error?: string };
      if (!response.ok) {
        setError(data.error ?? 'We could not sign you in. Please try again.');
        return;
      }

      // A `next` target is only honoured when it is a path on this site —
      // never an absolute URL, which would make this an open redirect.
      const safeNext = nextParam?.startsWith('/') && !nextParam.startsWith('//') ? nextParam : null;
      router.push(safeNext ?? HOME_BY_ROLE[data.role ?? 'CUSTOMER'] ?? '/');
      router.refresh();
    } catch {
      setError('We could not reach the server. Check your connection and try again.');
    } finally {
      setPending(false);
    }
  }

  const errParam = searchParams.get('error');
  const msgParam = searchParams.get('msg');
  let oauthError: string | null = null;
  if (errParam === 'google_auth_failed') oauthError = `Google authentication failed or was cancelled. ${msgParam ? `(${msgParam})` : ''}`;
  else if (errParam === 'google_token_failed') oauthError = `Failed to exchange token with Google. ${msgParam ? `(${msgParam})` : ''}`;
  else if (errParam === 'google_token_missing') oauthError = 'Access token missing in Google response.';
  else if (errParam === 'google_profile_failed') oauthError = 'Could not read Google profile information.';
  else if (errParam === 'google_email_missing') oauthError = 'Email permission is required to sign in.';
  else if (errParam === 'deactivated') oauthError = 'This account has been deactivated. Contact support.';
  else if (errParam === 'google_auth_error') oauthError = `Google sign-in error: ${msgParam || 'Unknown error'}`;

  const displayError = error ?? oauthError;

  return (
    <Card className="p-6">
      <h1 className="text-2xl font-extrabold">
        {mode === 'signin' ? 'Welcome back' : 'Create your account'}
      </h1>
      <p className="mt-1.5 text-sm text-muted">
        {mode === 'signin'
          ? 'Sign in to order ahead and skip the queue.'
          : 'Order before you arrive. Pick up when ready.'}
      </p>

      <div className="mt-6">
        <a
          href={`/api/auth/google/login${nextParam ? `?next=${encodeURIComponent(nextParam)}` : ''}`}
          className="flex w-full items-center justify-center gap-3 rounded-[var(--radius-field)] border border-border bg-surface px-4 py-2.5 font-semibold text-body transition-colors hover:bg-surface-muted focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          Continue with Google
        </a>

        <div className="relative my-4 flex items-center justify-center">
          <div className="w-full border-t border-border" />
          <span className="absolute bg-surface px-2 text-xs font-semibold uppercase text-muted">or</span>
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {mode === 'signup' ? (
          <>
            <fieldset>
              <legend className="mb-1.5 text-sm font-semibold">I am signing up as</legend>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { value: 'CUSTOMER', label: 'A customer', hint: 'Order from shops' },
                    { value: 'MERCHANT', label: 'A shop owner', hint: 'Take pre-orders' },
                  ] as const
                ).map((option) => (
                  <label
                    key={option.value}
                    className={`cursor-pointer rounded-[var(--radius-field)] border p-3 text-left transition-colors ${
                      accountType === option.value
                        ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/30'
                        : 'border-border bg-surface hover:bg-surface-muted'
                    }`}
                  >
                    <input
                      type="radio"
                      name="accountType"
                      value={option.value}
                      checked={accountType === option.value}
                      onChange={() => setAccountType(option.value)}
                      className="sr-only"
                    />
                    <span className="block text-sm font-bold">{option.label}</span>
                    <span className="block text-xs text-muted">{option.hint}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div>
              <Label htmlFor="name">Full name</Label>
              <Input id="name" name="name" autoComplete="name" required placeholder="Priya Raman" />
            </div>

            {accountType === 'MERCHANT' ? (
              <div>
                <Label htmlFor="businessName">Business name</Label>
                <Input
                  id="businessName"
                  name="businessName"
                  required
                  placeholder="Sri Kumar Tea Stall"
                  autoComplete="organization"
                />
              </div>
            ) : null}

            <div>
              <Label htmlFor="phone">Mobile number</Label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                required
                placeholder="98765 43210"
              />
            </div>
          </>
        ) : null}

        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@example.com"
          />
        </div>

        <div>
          <div className="flex items-baseline justify-between">
            <Label htmlFor="password">Password</Label>
            {mode === 'signin' ? (
              <Link href="/forgot-password" className="mb-1.5 text-sm font-semibold text-brand-600 hover:underline">
                Forgot?
              </Link>
            ) : null}
          </div>
          <PasswordInput
            id="password"
            name="password"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            required
            minLength={mode === 'signup' ? 8 : undefined}
            placeholder={mode === 'signup' ? 'At least 8 characters' : ''}
          />
        </div>

        <FieldError>{displayError}</FieldError>

        <Button type="submit" size="lg" loading={pending} className="w-full">
          {mode === 'signin' ? 'Sign in' : 'Create account'}
        </Button>
      </form>

      <p className="mt-5 text-center text-sm text-muted">
        {mode === 'signin' ? (
          <>
            New here?{' '}
            <Link href="/signup" className="font-semibold text-brand-600 hover:underline">
              Create an account
            </Link>
          </>
        ) : (
          <>
            Already have an account?{' '}
            <Link href="/signin" className="font-semibold text-brand-600 hover:underline">
              Sign in
            </Link>
          </>
        )}
      </p>
    </Card>
  );
}
