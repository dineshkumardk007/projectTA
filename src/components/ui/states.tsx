import * as React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, Skeleton } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';

/**
 * Empty, error and loading states.
 *
 * Rules this file enforces so they cannot drift:
 *  • Nothing ever renders a blank screen while loading.
 *  • No technical error text ever reaches a customer.
 *  • Every empty state suggests the next useful action.
 */

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-14 text-center', className)}>
      {icon ? (
        <div className="mb-4 flex size-16 items-center justify-center rounded-full bg-surface-muted text-muted">
          {icon}
        </div>
      ) : null}
      <h3 className="text-base font-bold">{title}</h3>
      {description ? <p className="mt-1.5 max-w-xs text-sm text-muted">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  description = "We couldn't load this right now. Please try again.",
  onRetry,
  className,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <Card className={cn('flex flex-col items-center px-6 py-12 text-center', className)}>
      <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-danger-50 text-danger-600 dark:bg-danger-500/15">
        <AlertTriangle aria-hidden className="size-6" />
      </div>
      <h3 className="text-base font-bold">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm text-muted">{description}</p>
      {onRetry ? (
        <Button variant="outline" className="mt-5" onClick={onRetry}>
          <RefreshCw aria-hidden className="size-4" />
          Try again
        </Button>
      ) : null}
    </Card>
  );
}

export function ShopCardSkeleton() {
  return (
    <Card className="overflow-hidden">
      <Skeleton className="h-32 w-full rounded-none" />
      <div className="space-y-2.5 p-4">
        <Skeleton className="h-4 w-2/5" />
        <Skeleton className="h-3 w-3/5" />
        <div className="flex gap-2 pt-1">
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>
      </div>
    </Card>
  );
}

export function ProductRowSkeleton() {
  return (
    <div className="flex items-center gap-3 py-4">
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-3 w-2/3" />
        <Skeleton className="h-3 w-16" />
      </div>
      <Skeleton className="size-20 rounded-[var(--radius-field)]" />
    </div>
  );
}

export function OrderCardSkeleton() {
  return (
    <Card className="space-y-3 p-4">
      <div className="flex justify-between">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>
      <Skeleton className="h-3 w-2/3" />
      <Skeleton className="h-12 w-full" />
    </Card>
  );
}

export function MetricSkeleton() {
  return (
    <Card className="space-y-3 p-4">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-7 w-16" />
    </Card>
  );
}
