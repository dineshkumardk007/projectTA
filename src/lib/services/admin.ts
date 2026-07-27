import 'server-only';
import { db } from '@/lib/db';
import { ACTIVE_STATUSES } from '@/lib/domain/order-status';

/**
 * Platform-wide metrics.
 *
 * The headline is deliberately *not* order count or revenue — it is total
 * customer waiting minutes saved (section 32). That is the number the product
 * is optimising for, so it is the number the dashboard leads with.
 */
export async function getPlatformOverview() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [
    activeShops,
    pendingMerchants,
    customers,
    ordersToday,
    completedToday,
    activeNow,
    savedAllTime,
    savedThisMonth,
    completedAllTime,
    revenueThisMonth,
    cancelledToday,
  ] = await Promise.all([
    db.shop.count({ where: { isActive: true, isVerified: true } }),
    db.merchant.count({ where: { verificationStatus: 'PENDING' } }),
    db.user.count({ where: { role: 'CUSTOMER' } }),
    db.order.count({ where: { placedAt: { gte: startOfDay } } }),
    db.order.count({ where: { status: 'PICKED_UP', pickedUpAt: { gte: startOfDay } } }),
    db.order.count({ where: { status: { in: ACTIVE_STATUSES } } }),
    db.order.aggregate({ _sum: { waitMinutesSaved: true } }),
    db.order.aggregate({
      where: { pickedUpAt: { gte: startOfMonth } },
      _sum: { waitMinutesSaved: true },
    }),
    db.order.count({ where: { status: 'PICKED_UP' } }),
    db.order.aggregate({
      where: { status: 'PICKED_UP', pickedUpAt: { gte: startOfMonth } },
      _sum: { totalMinor: true },
    }),
    db.order.count({ where: { status: { in: ['CANCELLED', 'REJECTED'] }, placedAt: { gte: startOfDay } } }),
  ]);

  // Split the headline metric by how it was arrived at. Orders where the
  // customer told us they had arrived give a real measurement; the rest fall
  // back to the ready-to-collected proxy, which is directionally useful but not
  // evidence. Reporting them together would quietly overstate the claim.
  const [measured, estimated] = await Promise.all([
    db.order.aggregate({
      where: { status: 'PICKED_UP', waitMeasured: true },
      _sum: { waitMinutesSaved: true },
      _count: { _all: true },
    }),
    db.order.aggregate({
      where: { status: 'PICKED_UP', waitMeasured: false },
      _sum: { waitMinutesSaved: true },
      _count: { _all: true },
    }),
  ]);

  const totalSaved = savedAllTime._sum.waitMinutesSaved ?? 0;

  return {
    activeShops,
    pendingMerchants,
    customers,
    ordersToday,
    completedToday,
    cancelledToday,
    activeNow,
    minutesSavedAllTime: totalSaved,
    minutesSavedThisMonth: savedThisMonth._sum.waitMinutesSaved ?? 0,
    completedAllTime,
    averageMinutesSaved: completedAllTime > 0 ? Math.round(totalSaved / completedAllTime) : 0,
    revenueThisMonthMinor: revenueThisMonth._sum.totalMinor ?? 0,
    measuredOrders: measured._count._all,
    measuredMinutesSaved: measured._sum.waitMinutesSaved ?? 0,
    estimatedOrders: estimated._count._all,
    estimatedMinutesSaved: estimated._sum.waitMinutesSaved ?? 0,
    /** Share of completed orders where arrival was actually reported. */
    measurementCoverage:
      completedAllTime > 0 ? Math.round((measured._count._all / completedAllTime) * 100) : 0,
  };
}

/** Per-shop leaderboard for the admin shops table. */
export async function getShopTable() {
  const shops = await db.shop.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      category: { select: { name: true } },
      merchant: { select: { businessName: true, verificationStatus: true, user: { select: { email: true } } } },
      _count: { select: { orders: true, products: true } },
    },
  });

  const saved = await db.order.groupBy({
    by: ['shopId'],
    where: { status: 'PICKED_UP' },
    _sum: { waitMinutesSaved: true },
    _count: { _all: true },
  });
  const savedByShop = new Map(saved.map((row) => [row.shopId, row]));

  return shops.map((shop) => {
    const stats = savedByShop.get(shop.id);
    return {
      id: shop.id,
      name: shop.name,
      slug: shop.slug,
      city: shop.city,
      category: shop.category.name,
      status: shop.status,
      isVerified: shop.isVerified,
      isActive: shop.isActive,
      baselineWaitMinutes: shop.baselineWaitMinutes,
      merchantName: shop.merchant.businessName,
      merchantEmail: shop.merchant.user.email,
      verificationStatus: shop.merchant.verificationStatus,
      totalOrders: shop._count.orders,
      productCount: shop._count.products,
      completedOrders: stats?._count._all ?? 0,
      minutesSaved: stats?._sum.waitMinutesSaved ?? 0,
    };
  });
}
