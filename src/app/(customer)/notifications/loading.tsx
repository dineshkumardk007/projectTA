import { Card, Skeleton } from '@/components/ui/primitives';

/** Notification list placeholder — see the note in `shops/[slug]/loading.tsx`. */
export default function NotificationsLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-7 w-36" />
      <div className="space-y-2.5">
        {[0, 1, 2, 3].map((row) => (
          <Card key={row} className="space-y-2 p-4">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3.5 w-3/4" />
          </Card>
        ))}
      </div>
    </div>
  );
}
