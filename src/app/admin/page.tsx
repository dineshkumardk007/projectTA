import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertCircle, Clock } from 'lucide-react';
import { getPlatformOverview } from '@/lib/services/admin';
import { db } from '@/lib/db';
import { Card, SectionHeader } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { formatMinor } from '@/lib/domain/money';
import { humanStatus } from '@/lib/domain/order-status';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Admin overview' };

export default async function AdminOverviewPage() {
  const [overview, recentOrders] = await Promise.all([
    getPlatformOverview(),
    db.order.findMany({
      orderBy: { placedAt: 'desc' },
      take: 10,
      select: {
        id: true,
        code: true,
        status: true,
        totalMinor: true,
        placedAt: true,
        waitMinutesSaved: true,
        shop: { select: { name: true } },
        customer: { select: { name: true } },
      },
    }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold">Platform overview</h1>

      {/* The north-star metric leads, because it is what the product is for. */}
      <Card className="overflow-hidden">
        <div className="bg-brand-500 px-6 py-6 text-white">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-white/80">
            <Clock aria-hidden className="size-4" />
            Total customer waiting time saved
          </p>
          <p className="mt-2 text-5xl font-extrabold tabular-nums">
            {overview.minutesSavedAllTime.toLocaleString('en-IN')}
            <span className="ml-2 text-2xl font-bold">min</span>
          </p>
          <p className="mt-2 text-sm text-white/85">
            {overview.minutesSavedThisMonth.toLocaleString('en-IN')} min this month ·{' '}
            {overview.averageMinutesSaved} min saved per collected order
          </p>
        </div>

        {/* Never present the headline as harder evidence than it is: only orders
            where the customer reported arriving give a real measurement. */}
        <div className="grid gap-px bg-border sm:grid-cols-2">
          <div className="bg-surface p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-muted">Measured</p>
            <p className="mt-1 text-xl font-extrabold tabular-nums">
              {overview.measuredMinutesSaved.toLocaleString('en-IN')} min
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {overview.measuredOrders} order{overview.measuredOrders === 1 ? '' : 's'} where the customer
              confirmed arrival
            </p>
          </div>
          <div className="bg-surface p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-muted">Estimated</p>
            <p className="mt-1 text-xl font-extrabold tabular-nums text-muted">
              {overview.estimatedMinutesSaved.toLocaleString('en-IN')} min
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {overview.estimatedOrders} order{overview.estimatedOrders === 1 ? '' : 's'} inferred from
              ready-to-collected time
            </p>
          </div>
        </div>

        <p className="border-t border-border px-4 py-3 text-xs text-muted">
          Measurement coverage <span className="font-bold text-foreground">{overview.measurementCoverage}%</span>.
          Raising this is the cheapest way to make the headline number defensible.
        </p>
      </Card>

      {overview.pendingMerchants > 0 ? (
        <Card className="flex flex-wrap items-center gap-3 border-warning-500/40 bg-warning-50 p-4 dark:bg-warning-500/10">
          <AlertCircle aria-hidden className="size-5 shrink-0 text-warning-600" />
          <p className="flex-1 text-sm font-semibold text-warning-700 dark:text-warning-100">
            {overview.pendingMerchants} merchant{overview.pendingMerchants === 1 ? '' : 's'} waiting for
            verification.
          </p>
          <Button asChild size="sm">
            <Link href="/admin/merchants">Review now</Link>
          </Button>
        </Card>
      ) : null}

      <section>
        <SectionHeader title="Today" />
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi label="Active shops" value={String(overview.activeShops)} />
          <Kpi label="Orders today" value={String(overview.ordersToday)} />
          <Kpi label="Completed today" value={String(overview.completedToday)} />
          <Kpi label="In progress now" value={String(overview.activeNow)} />
          <Kpi label="Registered customers" value={String(overview.customers)} />
          <Kpi label="Completed all time" value={String(overview.completedAllTime)} />
          <Kpi label="Cancelled/rejected today" value={String(overview.cancelledToday)} />
          <Kpi label="Order value this month" value={formatMinor(overview.revenueThisMonthMinor)} />
        </dl>
      </section>

      <section>
        <SectionHeader
          title="Recent orders"
          action={
            <Link href="/admin/orders" className="text-sm font-semibold text-brand-600">
              View all
            </Link>
          }
        />
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">Order</th>
                <th scope="col" className="px-4 py-3 font-semibold">Shop</th>
                <th scope="col" className="px-4 py-3 font-semibold">Customer</th>
                <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Total</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Saved</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {recentOrders.map((order) => (
                <tr key={order.id}>
                  <td className="px-4 py-3 font-semibold">{order.code}</td>
                  <td className="px-4 py-3">{order.shop.name}</td>
                  <td className="px-4 py-3 text-muted">{order.customer.name}</td>
                  <td className="px-4 py-3">{humanStatus(order.status)}</td>
                  <td className="px-4 py-3 text-right font-semibold">{formatMinor(order.totalMinor)}</td>
                  <td className="px-4 py-3 text-right text-muted">
                    {order.waitMinutesSaved != null ? `${order.waitMinutesSaved} min` : '—'}
                  </td>
                </tr>
              ))}
              {recentOrders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted">
                    No orders yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </Card>
      </section>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="mt-1 text-2xl font-extrabold tabular-nums">{value}</dd>
    </Card>
  );
}
