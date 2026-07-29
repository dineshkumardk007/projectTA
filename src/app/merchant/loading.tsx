import { Card, Skeleton } from '@/components/ui/primitives';
import { MetricSkeleton } from '@/components/ui/states';

/**
 * Placeholder for every merchant screen.
 *
 * Lives at the segment root so it covers the order board, menu and settings
 * too — a merchant tapping between them mid-rush should never be looking at a
 * page that appears to have stopped responding.
 */
export default function MerchantLoading() {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Skeleton className="h-3.5 w-32" />
        <Skeleton className="h-7 w-48" />
      </div>

      <Card className="space-y-3 p-4">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-12 w-full" />
      </Card>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MetricSkeleton />
        <MetricSkeleton />
        <MetricSkeleton />
        <MetricSkeleton />
      </div>

      <Skeleton className="h-14 w-full" />
    </div>
  );
}
