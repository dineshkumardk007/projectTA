import { Skeleton } from '@/components/ui/primitives';
import { OrderCardSkeleton } from '@/components/ui/states';

/** Order list placeholder — see the note in `shops/[slug]/loading.tsx`. */
export default function OrdersLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-7 w-32" />
      <div className="space-y-3">
        <OrderCardSkeleton />
        <OrderCardSkeleton />
        <OrderCardSkeleton />
      </div>
    </div>
  );
}
