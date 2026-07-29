import { Skeleton } from '@/components/ui/primitives';
import { ShopCardSkeleton } from '@/components/ui/states';

/** Discovery list placeholder — see the note in `shops/[slug]/loading.tsx`. */
export default function ShopsLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-7 w-40" />
      <Skeleton className="h-12 w-full" />
      <div className="flex gap-2">
        <Skeleton className="h-9 w-24 rounded-full" />
        <Skeleton className="h-9 w-28 rounded-full" />
        <Skeleton className="h-9 w-20 rounded-full" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <ShopCardSkeleton />
        <ShopCardSkeleton />
        <ShopCardSkeleton />
        <ShopCardSkeleton />
      </div>
    </div>
  );
}
