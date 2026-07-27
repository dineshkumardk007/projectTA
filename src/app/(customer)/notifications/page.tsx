import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Bell } from 'lucide-react';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/guards';
import { Card } from '@/components/ui/primitives';
import { EmptyState } from '@/components/ui/states';
import { cn } from '@/lib/cn';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Notifications' };

export default async function NotificationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/signin?next=/notifications');

  const notifications = await db.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  // Opening the list is the read receipt.
  await db.notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });

  if (notifications.length === 0) {
    return (
      <EmptyState
        icon={<Bell aria-hidden className="size-7" />}
        title="No notifications yet"
        description="Order updates — accepted, preparing, ready — will appear here."
      />
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold">Notifications</h1>
      <div className="space-y-2">
        {notifications.map((notification) => {
          const body = (
            <>
              <div className="flex items-start gap-3">
                <span
                  aria-hidden
                  className={cn(
                    'mt-1.5 size-2 shrink-0 rounded-full',
                    notification.readAt ? 'bg-transparent' : 'bg-brand-500',
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold leading-tight">{notification.title}</p>
                  <p className="mt-0.5 text-sm text-muted">{notification.body}</p>
                  <p className="mt-1 text-xs text-muted">
                    {notification.createdAt.toLocaleString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              </div>
            </>
          );

          return (
            <Card key={notification.id} className="p-4">
              {notification.href ? (
                <Link href={notification.href} className="block">
                  {body}
                </Link>
              ) : (
                body
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
