import { Card, Skeleton } from '@/components/ui/primitives';

/** Account placeholder — see the note in `shops/[slug]/loading.tsx`. */
export default function AccountLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-7 w-32" />
      <Card className="space-y-3 p-5">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-3.5 w-56" />
        <Skeleton className="h-3.5 w-44" />
      </Card>
      <Card className="space-y-3 p-5">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
      </Card>
    </div>
  );
}
