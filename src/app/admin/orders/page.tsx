import type { Metadata } from 'next';
import Link from 'next/link';
import type { OrderStatus } from '@prisma/client';
import { db } from '@/lib/db';
import { Badge, Card } from '@/components/ui/primitives';
import { formatMinor } from '@/lib/domain/money';
import { humanStatus } from '@/lib/domain/order-status';
import { cn } from '@/lib/cn';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Orders' };

const FILTERS: { key: string; label: string; statuses?: OrderStatus[] }[] = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'In progress', statuses: ['PLACED', 'ACCEPTED', 'PREPARING', 'READY'] },
  { key: 'completed', label: 'Completed', statuses: ['PICKED_UP'] },
  { key: 'problems', label: 'Cancelled / rejected', statuses: ['CANCELLED', 'REJECTED', 'EXPIRED'] },
];

const TONE: Record<OrderStatus, 'info' | 'warning' | 'success' | 'neutral' | 'danger'> = {
  PLACED: 'info',
  ACCEPTED: 'info',
  PREPARING: 'warning',
  READY: 'success',
  PICKED_UP: 'neutral',
  REJECTED: 'danger',
  CANCELLED: 'neutral',
  EXPIRED: 'neutral',
};

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filterKey = (Array.isArray(params.filter) ? params.filter[0] : params.filter) ?? 'all';
  const filter = FILTERS.find((f) => f.key === filterKey) ?? FILTERS[0];

  const orders = await db.order.findMany({
    where: filter.statuses ? { status: { in: filter.statuses } } : undefined,
    orderBy: { placedAt: 'desc' },
    take: 100,
    select: {
      id: true,
      code: true,
      status: true,
      totalMinor: true,
      placedAt: true,
      promisedPrepMinutes: true,
      actualPrepMinutes: true,
      waitMinutesSaved: true,
      paymentMethod: true,
      paymentStatus: true,
      shop: { select: { name: true } },
      customer: { select: { name: true, email: true } },
    },
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold">Orders</h1>

      <div className="scroll-rail">
        {FILTERS.map((option) => (
          <Link
            key={option.key}
            href={option.key === 'all' ? '/admin/orders' : `/admin/orders?filter=${option.key}`}
            aria-current={filter.key === option.key ? 'page' : undefined}
            className={cn(
              'rounded-[var(--radius-pill)] border px-3.5 py-2 text-sm font-semibold',
              filter.key === option.key
                ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200'
                : 'border-border bg-surface text-muted hover:text-foreground',
            )}
          >
            {option.label}
          </Link>
        ))}
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">Order</th>
              <th scope="col" className="px-4 py-3 font-semibold">Shop</th>
              <th scope="col" className="px-4 py-3 font-semibold">Customer</th>
              <th scope="col" className="px-4 py-3 font-semibold">Status</th>
              <th scope="col" className="px-4 py-3 font-semibold">Payment</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">Promised / actual</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {orders.map((order) => (
              <tr key={order.id}>
                <td className="px-4 py-3">
                  <p className="font-semibold">{order.code}</p>
                  <p className="text-xs text-muted">
                    {order.placedAt.toLocaleString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </p>
                </td>
                <td className="px-4 py-3">{order.shop.name}</td>
                <td className="px-4 py-3 text-muted">
                  <p>{order.customer.name}</p>
                  <p className="text-xs">{order.customer.email}</p>
                </td>
                <td className="px-4 py-3">
                  <Badge tone={TONE[order.status]}>{humanStatus(order.status)}</Badge>
                </td>
                <td className="px-4 py-3 text-muted">
                  <p>{order.paymentMethod === 'CASH_ON_PICKUP' ? 'Cash' : 'Online'}</p>
                  <p className="text-xs">{order.paymentStatus}</p>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {order.promisedPrepMinutes} / {order.actualPrepMinutes ?? '—'} min
                  {order.waitMinutesSaved != null ? (
                    <p className="text-xs text-success-600">saved {order.waitMinutesSaved} min</p>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-right font-semibold">{formatMinor(order.totalMinor)}</td>
              </tr>
            ))}
            {orders.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted">
                  No orders match this filter.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
