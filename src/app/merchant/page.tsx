import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { requireMerchantContext, getShopAnalytics } from '@/lib/services/merchant';
import { countActiveOrders } from '@/lib/services/orders';
import { estimatePrepMinutes } from '@/lib/domain/prep-time';
import { ShopStatusControl } from '@/components/merchant/shop-status-control';
import { Card, SectionHeader } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { formatMinor } from '@/lib/domain/money';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Merchant dashboard' };

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default async function MerchantHomePage() {
  const { user, shop } = await requireMerchantContext();

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [activeOrders, analytics, todayOrders, todaySales, readyCount] = await Promise.all([
    countActiveOrders(shop.id),
    getShopAnalytics(shop.id),
    db.order.count({ where: { shopId: shop.id, placedAt: { gte: startOfDay } } }),
    db.order.aggregate({
      where: { shopId: shop.id, status: 'PICKED_UP', pickedUpAt: { gte: startOfDay } },
      _sum: { totalMinor: true },
    }),
    db.order.count({ where: { shopId: shop.id, status: 'READY' } }),
  ]);

  const estimate = estimatePrepMinutes({
    itemPrepMinutes: [],
    basePrepMinutes: shop.basePrepMinutes,
    activeOrderCount: activeOrders,
    status: shop.status,
  });

  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm text-muted">
          {greeting()}, {user.name.split(' ')[0]}
        </p>
        <h1 className="text-2xl font-extrabold">{shop.name}</h1>
      </header>

      <ShopStatusControl
        shopId={shop.id}
        initialStatus={shop.status}
        currentPrepMinutes={estimate.minutes}
      />

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label="In the kitchen" value={String(activeOrders)} />
        <Metric label="Waiting for pickup" value={String(readyCount)} highlight={readyCount > 0} />
        <Metric label="Orders today" value={String(todayOrders)} />
        <Metric label="Sales today" value={formatMinor(todaySales._sum.totalMinor ?? 0)} />
      </dl>

      <Button asChild size="action">
        <Link href="/merchant/orders">
          Open the order board
          <ArrowRight aria-hidden className="size-4" />
        </Link>
      </Button>

      <section>
        <SectionHeader title="Last 30 days" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Card className="p-4">
            <h3 className="text-sm font-bold">Preparation accuracy</h3>
            {analytics.averagePrepMinutes != null && analytics.averagePromisedMinutes != null ? (
              <>
                <p className="mt-2 text-2xl font-extrabold">
                  {analytics.averagePrepMinutes} min
                  <span className="ml-2 text-sm font-semibold text-muted">
                    actual vs {analytics.averagePromisedMinutes} min promised
                  </span>
                </p>
                <p className="mt-1 text-xs text-muted">
                  {analytics.averagePrepMinutes <= analytics.averagePromisedMinutes
                    ? 'You are usually ready on time or early.'
                    : 'You are running behind your estimates — consider raising your base preparation time.'}
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm text-muted">Not enough completed orders yet.</p>
            )}
          </Card>

          <Card className="p-4">
            <h3 className="text-sm font-bold">Customer time saved</h3>
            <p className="mt-2 text-2xl font-extrabold">{analytics.minutesSaved} min</p>
            <p className="mt-1 text-xs text-muted">
              Queueing avoided by your customers across {analytics.completed} collected{' '}
              {analytics.completed === 1 ? 'order' : 'orders'}.
            </p>
          </Card>

          <Card className="p-4">
            <h3 className="text-sm font-bold">Popular items</h3>
            {analytics.popularItems.length > 0 ? (
              <ol className="mt-2 space-y-1.5">
                {analytics.popularItems.map((item, index) => (
                  <li key={item.name} className="flex justify-between text-sm">
                    <span>
                      <span className="mr-2 text-muted">{index + 1}.</span>
                      {item.name}
                    </span>
                    <span className="font-semibold text-muted">{item.quantity}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-2 text-sm text-muted">No orders yet.</p>
            )}
          </Card>

          <Card className="p-4">
            <h3 className="text-sm font-bold">Peak hours</h3>
            {analytics.peakHours.length > 0 ? (
              <ul className="mt-2 space-y-1.5">
                {analytics.peakHours.map((slot) => (
                  <li key={slot.hour} className="flex justify-between text-sm">
                    <span>
                      {formatHour(slot.hour)} – {formatHour((slot.hour + 1) % 24)}
                    </span>
                    <span className="font-semibold text-muted">{slot.count} orders</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted">No orders yet.</p>
            )}
            <div className="mt-3 border-t border-border pt-3 text-xs text-muted">
              Average order {formatMinor(analytics.averageOrderValueMinor)} ·{' '}
              {analytics.repeatCustomers} of {analytics.uniqueCustomers}{' '}
              {analytics.uniqueCustomers === 1 ? 'customer' : 'customers'} came back
            </div>
          </Card>
        </div>
      </section>
    </div>
  );
}

function formatHour(hour: number): string {
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h} ${suffix}`;
}

function Metric({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <Card className={highlight ? 'bg-success-50 p-4 dark:bg-success-500/10' : 'p-4'}>
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="mt-0.5 text-2xl font-extrabold tabular-nums">{value}</dd>
    </Card>
  );
}
