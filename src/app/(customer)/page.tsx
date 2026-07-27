import Link from 'next/link';
import { Suspense } from 'react';
import { ArrowRight } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth/guards';
import { db } from '@/lib/db';
import { listCategories, listShops } from '@/lib/services/shops';
import { OPEN_STATUSES } from '@/lib/domain/order-status';
import { CategoryScroller, QuickActions, SearchBar } from '@/components/customer/discovery-bits';
import { ShopGrid } from '@/components/customer/shop-grid';
import { ShopCardCompact } from '@/components/customer/shop-card';
import { ActiveOrderBanner } from '@/components/customer/active-order-banner';
import { ReorderRail } from '@/components/customer/reorder-rail';
import { SectionHeader } from '@/components/ui/primitives';
import { ShopCardSkeleton } from '@/components/ui/states';

export const dynamic = 'force-dynamic';

function greeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

async function HomeContent() {
  const user = await getCurrentUser();

  const [categories, shops, activeOrder, recentOrders] = await Promise.all([
    listCategories(),
    listShops({ viewerId: user?.id, filters: { sort: 'fastest' } }),
    user
      ? db.order.findFirst({
          where: { customerId: user.id, status: { in: OPEN_STATUSES } },
          orderBy: { placedAt: 'desc' },
          select: {
            id: true,
            code: true,
            status: true,
            estimatedReadyAt: true,
            shop: { select: { name: true } },
          },
        })
      : Promise.resolve(null),
    user
      ? db.order.findMany({
          where: { customerId: user.id, status: 'PICKED_UP' },
          orderBy: { pickedUpAt: 'desc' },
          take: 5,
          select: {
            id: true,
            code: true,
            totalMinor: true,
            pickedUpAt: true,
            shop: { select: { id: true, name: true, slug: true } },
            items: { select: { nameSnapshot: true, quantity: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  const readyFast = shops.filter((s) => s.orderability.canOrder && s.prepMinutes <= 12).slice(0, 6);

  return (
    <div className="space-y-6">
      {activeOrder ? (
        <ActiveOrderBanner
          order={{
            id: activeOrder.id,
            code: activeOrder.code,
            status: activeOrder.status,
            shopName: activeOrder.shop.name,
            estimatedReadyAt: activeOrder.estimatedReadyAt,
          }}
        />
      ) : null}

      <section>
        <h1 className="text-[26px] font-extrabold leading-tight">
          {user ? `${greeting()}, ${user.name.split(' ')[0]}` : 'Order before you arrive'}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {user ? 'What are you ordering today?' : 'Pick up when ready. Skip the queue entirely.'}
        </p>
        <div className="mt-4">
          <SearchBar />
        </div>
      </section>

      <section aria-labelledby="categories-heading">
        <h2 id="categories-heading" className="sr-only">
          Categories
        </h2>
        <CategoryScroller categories={categories} />
      </section>

      <section aria-labelledby="quick-actions-heading">
        <h2 id="quick-actions-heading" className="sr-only">
          Quick actions
        </h2>
        <QuickActions />
      </section>

      {recentOrders.length > 0 ? <ReorderRail orders={recentOrders} /> : null}

      {readyFast.length > 0 ? (
        <section aria-labelledby="ready-fast-heading">
          <SectionHeader
            title={<span id="ready-fast-heading">Ready in under 12 minutes</span>}
            action={
              <Link href="/shops?readyFast=1" className="flex items-center gap-1 text-sm font-semibold text-brand-600">
                See all <ArrowRight aria-hidden className="size-4" />
              </Link>
            }
          />
          <div className="scroll-rail -mx-4 px-4 pb-1">
            {readyFast.map((shop) => (
              <ShopCardCompact key={shop.id} shop={shop} />
            ))}
          </div>
        </section>
      ) : null}

      <section aria-labelledby="nearby-heading">
        <SectionHeader
          title={<span id="nearby-heading">Shops near you</span>}
          action={
            <Link href="/shops" className="flex items-center gap-1 text-sm font-semibold text-brand-600">
              See all <ArrowRight aria-hidden className="size-4" />
            </Link>
          }
        />
        <ShopGrid shops={shops.slice(0, 8)} />
      </section>
    </div>
  );
}

function HomeSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-20 rounded-[var(--radius-card)] bg-surface-muted" />
      <div className="grid gap-3 sm:grid-cols-2">
        <ShopCardSkeleton />
        <ShopCardSkeleton />
      </div>
    </div>
  );
}

export default function CustomerHomePage() {
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <HomeContent />
    </Suspense>
  );
}
