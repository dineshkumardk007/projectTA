import { Suspense } from 'react';
import type { Metadata } from 'next';
import { AuthForm } from '@/components/auth/auth-form';
import { Skeleton } from '@/components/ui/primitives';

export const metadata: Metadata = { title: 'Sign in' };

export default function SignInPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-[var(--radius-card)]" />}>
      <AuthForm mode="signin" />
    </Suspense>
  );
}
