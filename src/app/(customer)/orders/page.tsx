import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Receipt } from 'lucide-react';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/guards';
import { OPEN_STATUSES, humanStatus } from '@/lib/domain/order-status';
import { Badge, Card, SectionHeader } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/states';
import { ReorderButton } from '@/components/customer/reorder-button';
import { formatMinor } from '@/lib/domain/money';
import { formatClockTime } from '@/lib/domain/prep-time';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Your orders' };

const STATUS_TONE = {
  PLACED: 'info',
  ACCEPTED: 'info',
  PREPARING: 'warning',
  READY: 'success',
  PICKED_UP: 'neutral',
  REJECTED: 'danger',
  CANCELLED: 'neutral',
  EXPIRED: 'neutral',
} as const;

export default async function OrdersPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/signin?next=/orders');

  const orders = await db.order.findMany({
    where: { customerId: user.id },
    orderBy: { placedAt: 'desc' },
    take: 50,
    include: {
      shop: { select: { name: true, slug: true } },
      items: { select: { nameSnapshot: true, quantity: true } },
    },
  });

  if (orders.length === 0) {
    return (
      <EmptyState
        icon={<Receipt aria-hidden className="size-7" />}
        title="You haven't placed an order yet"
        description="Find a nearby shop and order ahead — your order is prepared while you travel."
        action={
          <Button asChild>
            <Link href="/shops">Find a shop</Link>
          </Button>
        }
      />
    );
  }

  const active = orders.filter((o) => OPEN_STATUSES.includes(o.status));
  const past = orders.filter((o) => !OPEN_STATUSES.includes(o.status));

  const totalSaved = past.reduce((sum, order) => sum + (order.waitMinutesSaved ?? 0), 0);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold">Your orders</h1>

      {totalSaved > 0 ? (
        <Card className="bg-brand-50 p-4 dark:bg-brand-900/25">
          <p className="text-sm font-semibold text-brand-700 dark:text-brand-100">
            You have saved about{' '}
            <span className="text-lg font-extrabold">{totalSaved} minutes</span> of queueing so far.
          </p>
        </Card>
      ) : null}

      {active.length > 0 ? (
        <section>
          <SectionHeader title="In progress" />
          <div className="space-y-3">
            {active.map((order) => (
              <OrderRow key={order.id} order={order} />
            ))}
          </div>
        </section>
      ) : null}

      {past.length > 0 ? (
        <section>
          <SectionHeader title="Past orders" />
          <div className="space-y-3">
            {past.map((order) => (
              <OrderRow key={order.id} order={order} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

type OrderRowProps = {
  order: {
    id: string;
    code: string;
    status: keyof typeof STATUS_TONE;
    totalMinor: number;
    placedAt: Date;
    estimatedReadyAt: Date;
    waitMinutesSaved: number | null;
    shop: { name: string; slug: string };
    items: { nameSnapshot: string; quantity: number }[];
  };
};

function OrderRow({ order }: OrderRowProps) {
  const summary = order.items.map((i) => `${i.quantity} × ${i.nameSnapshot}`).join(', ');
  const open = OPEN_STATUSES.includes(order.status);

  return (
    <Card as="article" className="p-4 transition-shadow hover:shadow-[var(--shadow-raised)]">
      <Link href={`/orders/${order.id}`} className="block">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-bold leading-tight">
              {order.shop.name} <span className="text-muted">· {order.code}</span>
            </p>
            <p className="mt-1 line-clamp-2 text-sm text-muted">{summary}</p>
          </div>
          <Badge tone={STATUS_TONE[order.status]}>{humanStatus(order.status)}</Badge>
        </div>

        <div className="mt-3 flex items-center justify-between text-sm">
          <span className="text-muted">
            {open
              ? `Ready by about ${formatClockTime(order.estimatedReadyAt)}`
              : order.placedAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
            {!open && order.waitMinutesSaved ? ` · saved ${order.waitMinutesSaved} min` : ''}
          </span>
          <span className="font-bold">{formatMinor(order.totalMinor)}</span>
        </div>
      </Link>

      {/* Outside the <Link> — a button nested inside an anchor is invalid HTML
          and swallows keyboard activation. Every closed order is reorderable
          here, not just the five most recent shown on the home page. */}
      {!open ? (
        <div className="mt-3 border-t border-border pt-3">
          <ReorderButton orderId={order.id} className="w-full" size="md" variant="secondary" />
        </div>
      ) : null}
    </Card>
  );
}
