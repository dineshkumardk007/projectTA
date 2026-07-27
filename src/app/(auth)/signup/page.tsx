import { Suspense } from 'react';
import type { Metadata } from 'next';
import { AuthForm } from '@/components/auth/auth-form';
import { Skeleton } from '@/components/ui/primitives';

export const metadata: Metadata = { title: 'Create account' };

export default function SignUpPage() {
  return (
    <Suspense fallback={<Skeleton className="h-[32rem] w-full rounded-[var(--radius-card)]" />}>
      <AuthForm mode="signup" />
    </Suspense>
  );
}
