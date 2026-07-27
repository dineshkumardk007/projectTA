'use client';

import * as React from 'react';
import Link from 'next/link';
import { MailCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, FieldError, Input, Label } from '@/components/ui/primitives';

export function ForgotPasswordForm() {
  const [pending, setPending] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: form.get('email') }),
      });
      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(data.error ?? 'We could not send that email. Please try again.');
        return;
      }
      setSent(true);
    } catch {
      setError('We could not reach the server. Check your connection and try again.');
    } finally {
      setPending(false);
    }
  }

  // Deliberately the same message whether or not the account exists — telling
  // the difference would let anyone check which addresses are registered.
  if (sent) {
    return (
      <Card className="p-6 text-center">
        <span className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-success-50 text-success-600 dark:bg-success-500/15">
          <MailCheck aria-hidden className="size-6" />
        </span>
        <h1 className="text-xl font-extrabold">Check your email</h1>
        <p className="mt-2 text-sm text-muted">
          If that address has an account, a reset link is on its way. It expires in one hour.
        </p>
        <Button asChild variant="outline" className="mt-5 w-full">
          <Link href="/signin">Back to sign in</Link>
        </Button>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <h1 className="text-2xl font-extrabold">Reset your password</h1>
      <p className="mt-1.5 text-sm text-muted">
        Enter the email you signed up with and we will send you a link.
      </p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required placeholder="you@example.com" />
        </div>

        <FieldError>{error}</FieldError>

        <Button type="submit" size="lg" loading={pending} className="w-full">
          Send reset link
        </Button>
      </form>

      <p className="mt-5 text-center text-sm text-muted">
        Remembered it?{' '}
        <Link href="/signin" className="font-semibold text-brand-600 hover:underline">
          Sign in
        </Link>
      </p>
    </Card>
  );
}
