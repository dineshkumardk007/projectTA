'use client';

import * as React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/primitives';

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error('[admin error]', error);
  }, [error]);

  return (
    <div className="mx-auto max-w-2xl py-12">
      <Card className="p-6 text-center space-y-4">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-danger-100 dark:bg-danger-500/20 text-danger-600">
          <AlertTriangle className="size-6" />
        </div>
        <h2 className="text-xl font-bold">This page couldn&apos;t load</h2>
        <p className="text-sm text-muted">
          {error.message || 'An unexpected error occurred while loading this admin section.'}
        </p>
        <p className="text-xs text-muted">
          If you recently switched or reset your database, run <code className="bg-surface-muted px-1.5 py-0.5 rounded font-mono">pnpm db:push</code> and <code className="bg-surface-muted px-1.5 py-0.5 rounded font-mono">pnpm db:seed</code> to sync all database tables.
        </p>
        <div className="pt-2 flex items-center justify-center gap-3">
          <Button onClick={() => reset()} size="sm">
            <RefreshCw className="mr-2 size-4" />
            Try again
          </Button>
        </div>
      </Card>
    </div>
  );
}
