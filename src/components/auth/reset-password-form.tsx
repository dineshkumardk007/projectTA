'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, FieldError, Input, Label } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';

export function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const token = searchParams.get('token') ?? '';

  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const form = new FormData(event.currentTarget);
    const password = String(form.get('password'));
    const confirm = String(form.get('confirm'));

    if (password !== confirm) {
      setError('Those passwords do not match.');
      return;
    }

    setPending(true);
    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(data.error ?? 'We could not reset your password.');
        return;
      }

      toast('Password updated. Sign in with your new password.');
      router.push('/signin');
    } catch {
      setError('We could not reach the server. Check your connection and try again.');
    } finally {
      setPending(false);
    }
  }

  if (!token) {
    return (
      <Card className="p-6 text-center">
        <h1 className="text-xl font-extrabold">That link is incomplete</h1>
        <p className="mt-2 text-sm text-muted">
          Open the link from your email again, or request a new one.
        </p>
        <Button asChild className="mt-5 w-full">
          <Link href="/forgot-password">Request a new link</Link>
        </Button>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <h1 className="text-2xl font-extrabold">Choose a new password</h1>
      <p className="mt-1.5 text-sm text-muted">
        You will be signed out on every device once this is saved.
      </p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
        <div>
          <Label htmlFor="password">New password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            placeholder="At least 8 characters"
          />
        </div>

        <div>
          <Label htmlFor="confirm">Confirm new password</Label>
          <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required minLength={8} />
        </div>

        <FieldError>{error}</FieldError>

        <Button type="submit" size="lg" loading={pending} className="w-full">
          Save new password
        </Button>
      </form>
    </Card>
  );
}
