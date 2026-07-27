import 'server-only';
import { redirect } from 'next/navigation';
import type { Shop } from '@prisma/client';
import { db } from '@/lib/db';
import { listAccessibleShops, requireUserPage, type AuthedUser } from '@/lib/auth/guards';

/**
 * Resolves which shop a merchant screen is operating on.
 *
 * A merchant may own several shops (and staff may work at more than one), so
 * every merchant page goes through this rather than assuming "the first shop".
 * An unverified merchant with no shop yet is routed to onboarding instead of
 * seeing an empty dashboard.
 */
export type MerchantContext = {
  user: AuthedUser;
  shop: Shop;
  shops: Shop[];
};

export async function requireMerchantContext(preferredShopId?: string): Promise<MerchantContext> {
  const user = await requireUserPage(['MERCHANT', 'STAFF', 'ADMIN'], '/signin?next=/merchant');
  const shops = await listAccessibleShops(user);

  if (shops.length === 0) redirect('/merchant/onboarding');

  const shop = (preferredShopId ? shops.find((s) => s.id === preferredShopId) : undefined) ?? shops[0];
  return { user, shop, shops };
}

/**
 * Merchant analytics (section 30).
 *
 * "Estimated vs actual preparation" is the one that matters most: a shop that
 * consistently overruns its own estimate is the fastest way to lose a customer's
 * trust in the whole platform.
 */
export async function getShopAnalytics(shopId: string) {
  const since = new Date();
  since.setDate(since.getDate() - 30);

  const [completed, rejected, cancelled, prepStats, popular, hourly, repeat] = await Promise.all([
    db.order.count({ where: { shopId, status: 'PICKED_UP', placedAt: { gte: since } } }),
    db.order.count({ where: { shopId, status: 'REJECTED', placedAt: { gte: since } } }),
    db.order.count({ where: { shopId, status: 'CANCELLED', placedAt: { gte: since } } }),
    db.order.aggregate({
      where: { shopId, status: 'PICKED_UP', placedAt: { gte: since } },
      _avg: { actualPrepMinutes: true, promisedPrepMinutes: true, totalMinor: true },
      _sum: { totalMinor: true, waitMinutesSaved: true },
    }),
    db.orderItem.groupBy({
      by: ['nameSnapshot'],
      where: { order: { shopId, placedAt: { gte: since } } },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: 5,
    }),
    db.$queryRaw<{ hour: number; count: bigint }[]>`
      SELECT EXTRACT(HOUR FROM "placedAt")::int AS hour, COUNT(*)::bigint AS count
      FROM "Order"
      WHERE "shopId" = ${shopId} AND "placedAt" >= ${since}
      GROUP BY hour
      ORDER BY count DESC
      LIMIT 3
    `,
    db.order.groupBy({
      by: ['customerId'],
      where: { shopId, status: 'PICKED_UP', placedAt: { gte: since } },
      _count: { _all: true },
    }),
  ]);

  const totalOrders = completed + rejected + cancelled;
  const repeatCustomers = repeat.filter((r) => r._count._all > 1).length;

  return {
    completed,
    rejected,
    cancelled,
    acceptanceRate: totalOrders > 0 ? Math.round(((totalOrders - rejected) / totalOrders) * 100) : null,
    averagePrepMinutes: prepStats._avg.actualPrepMinutes ? Math.round(prepStats._avg.actualPrepMinutes) : null,
    averagePromisedMinutes: prepStats._avg.promisedPrepMinutes
      ? Math.round(prepStats._avg.promisedPrepMinutes)
      : null,
    averageOrderValueMinor: prepStats._avg.totalMinor ? Math.round(prepStats._avg.totalMinor) : 0,
    revenueMinor: prepStats._sum.totalMinor ?? 0,
    minutesSaved: prepStats._sum.waitMinutesSaved ?? 0,
    popularItems: popular.map((p) => ({ name: p.nameSnapshot, quantity: p._sum.quantity ?? 0 })),
    peakHours: hourly.map((h) => ({ hour: h.hour, count: Number(h.count) })),
    repeatCustomers,
    uniqueCustomers: repeat.length,
  };
}
