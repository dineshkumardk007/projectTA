import { Card, Skeleton } from '@/components/ui/primitives';
import { MetricSkeleton } from '@/components/ui/states';

/**
 * Placeholder for every admin screen.
 *
 * The analytics and subscription pages aggregate across the whole platform, so
 * they are the slowest routes in the app by some margin — exactly where a
 * skeleton earns its keep.
 */
export default function AdminLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-56" />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricSkeleton />
        <MetricSkeleton />
        <MetricSkeleton />
        <MetricSkeleton />
      </div>

      <Card className="space-y-3 p-4">
        <Skeleton className="h-4 w-32" />
        {[0, 1, 2, 3, 4].map((row) => (
          <Skeleton key={row} className="h-10 w-full" />
        ))}
      </Card>
    </div>
  );
}
