import { db } from '@/lib/db';
import { ok, route } from '@/lib/api';
import { requireShopAccess, requireUser } from '@/lib/auth/guards';

export const GET = route(async (_request: Request, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  const user = await requireUser(['MERCHANT', 'STAFF', 'ADMIN']);
  const { shop } = await requireShopAccess(id, user);

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [todayOrders, weekOrders, monthOrders] = await Promise.all([
    db.order.findMany({
      where: { shopId: shop.id, placedAt: { gte: startOfDay } },
      select: { totalMinor: true, status: true, placedAt: true, waitMinutesSaved: true },
    }),
    db.order.aggregate({
      where: { shopId: shop.id, placedAt: { gte: startOfWeek }, status: 'PICKED_UP' },
      _sum: { totalMinor: true },
      _count: { _all: true },
    }),
    db.order.aggregate({
      where: { shopId: shop.id, placedAt: { gte: startOfMonth }, status: 'PICKED_UP' },
      _sum: { totalMinor: true },
      _count: { _all: true },
    }),
  ]);

  // Calculate Peak Rush Hours (hourly distribution 6 AM to 10 PM)
  const hourlyCounts: Record<number, number> = {};
  for (let h = 6; h <= 22; h++) hourlyCounts[h] = 0;

  let totalWaitSaved = 0;
  for (const order of todayOrders) {
    const hour = new Date(order.placedAt).getHours();
    if (hourlyCounts[hour] !== undefined) {
      hourlyCounts[hour] += 1;
    }
    if (order.waitMinutesSaved) {
      totalWaitSaved += order.waitMinutesSaved;
    }
  }

  // Top 5 Bestselling Products
  const topProducts = await db.orderItem.groupBy({
    by: ['nameSnapshot'],
    where: { order: { shopId: shop.id, status: 'PICKED_UP' } },
    _sum: { quantity: true, lineTotalMinor: true },
    orderBy: { _sum: { quantity: 'desc' } },
    take: 5,
  });

  return ok({
    shop: { id: shop.id, name: shop.name },
    today: {
      salesMinor: todayOrders.filter((o) => o.status === 'PICKED_UP').reduce((acc, o) => acc + o.totalMinor, 0),
      ordersCount: todayOrders.length,
      waitMinutesSaved: totalWaitSaved,
    },
    week: {
      salesMinor: weekOrders._sum.totalMinor ?? 0,
      completedCount: weekOrders._count._all,
    },
    month: {
      salesMinor: monthOrders._sum.totalMinor ?? 0,
      completedCount: monthOrders._count._all,
    },
    hourlyPeak: Object.entries(hourlyCounts).map(([hour, count]) => ({
      hour: `${hour}:00`,
      count,
    })),
    topProducts: topProducts.map((p) => ({
      name: p.nameSnapshot,
      quantity: p._sum.quantity ?? 0,
      revenueMinor: p._sum.lineTotalMinor ?? 0,
    })),
  });
});
