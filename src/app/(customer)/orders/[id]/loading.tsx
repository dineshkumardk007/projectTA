import { Card, Skeleton } from '@/components/ui/primitives';

/**
 * Order tracking placeholder.
 *
 * This is the most-reopened screen in the app — a customer waiting on an order
 * checks it repeatedly — so it is the one where a frozen tap is felt most.
 */
export default function OrderDetailLoading() {
  return (
    <div className="space-y-4">
      <Card className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2">
            <Skeleton className="h-8 w-28" />
            <Skeleton className="h-3.5 w-36" />
          </div>
          <Skeleton className="h-7 w-24 rounded-full" />
        </div>
        <Skeleton className="h-2 w-full rounded-full" />
        <Skeleton className="h-16 w-full" />
      </Card>

      <Card className="space-y-3 p-5">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-4/5" />
        <Skeleton className="h-3.5 w-2/3" />
      </Card>
    </div>
  );
}
