import { Card, Skeleton } from '@/components/ui/primitives';
import { ProductRowSkeleton } from '@/components/ui/states';

/**
 * Shown the instant a shop card is tapped.
 *
 * Without this file Next.js holds the *previous* page on screen until every
 * query for the shop has returned — on a phone that reads as a frozen app, and
 * customers tap again, which queues a second navigation and makes it worse.
 *
 * The shape deliberately mirrors the real page (cover, header card, menu rows)
 * so the transition is a fill-in rather than a re-layout.
 */
export default function ShopPageLoading() {
  return (
    <div className="-mx-4 -mt-4">
      <Skeleton className="h-44 w-full rounded-none sm:h-56" />

      <div className="px-4">
        <Card className="relative -mt-8 p-4">
          <div className="flex items-start gap-3">
            <Skeleton className="size-14 shrink-0" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-6 w-1/2" />
              <Skeleton className="h-3.5 w-2/3" />
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <Skeleton className="h-7 w-24 rounded-full" />
            <Skeleton className="h-7 w-28 rounded-full" />
          </div>

          <div className="mt-4 space-y-2.5">
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="h-3.5 w-1/2" />
            <Skeleton className="h-3.5 w-1/3" />
          </div>
        </Card>

        <div className="mt-5">
          <Skeleton className="h-10 w-full rounded-lg" />
          <div className="mt-4 flex gap-2">
            <Skeleton className="h-9 w-24 rounded-full" />
            <Skeleton className="h-9 w-20 rounded-full" />
            <Skeleton className="h-9 w-24 rounded-full" />
          </div>
          <div className="mt-4 divide-y divide-border">
            <ProductRowSkeleton />
            <ProductRowSkeleton />
            <ProductRowSkeleton />
            <ProductRowSkeleton />
          </div>
        </div>
      </div>
    </div>
  );
}
