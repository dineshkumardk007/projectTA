'use client';

import * as React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/primitives';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error('[global error]', error);
  }, [error]);

  return (
    <div className="mx-auto max-w-md py-16 px-4">
      <Card className="p-6 text-center space-y-4">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-danger-100 dark:bg-danger-500/20 text-danger-600">
          <AlertTriangle className="size-6" />
        </div>
        <h2 className="text-xl font-bold">Something went wrong</h2>
        <p className="text-sm text-muted">
          {error.message || 'The page could not be loaded. Please try again.'}
        </p>
        <div className="pt-2 flex items-center justify-center gap-3">
          <Button onClick={() => reset()} size="sm">
            <RefreshCw className="mr-2 size-4" />
            Reload Page
          </Button>
        </div>
      </Card>
    </div>
  );
}
