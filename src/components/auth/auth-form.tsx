'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, FieldError, Input, Label } from '@/components/ui/primitives';

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

      <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
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
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            required
            minLength={mode === 'signup' ? 8 : undefined}
            placeholder={mode === 'signup' ? 'At least 8 characters' : ''}
          />
        </div>

        <FieldError>{error}</FieldError>

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
