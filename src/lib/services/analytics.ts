import 'server-only';
import { db } from '@/lib/db';

/**
 * Platform growth analytics.
 *
 * Everything here is aggregate: counts, sums and buckets. No function returns a
 * named customer, and the geo model deliberately rounds coordinates before
 * grouping so a "cold spot" can never be read back as one person's address.
 *
 * The heavy shapes (time series, hour-of-day buckets, coordinate grids) are done
 * in SQL rather than JavaScript — a year of orders is not something to pull into
 * memory to count.
 */

const DEFAULT_DAYS = 30;

function startOfDayUtcOffsetDays(days: number): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - days);
  return date;
}

export type TimePoint = { date: string; value: number };

/** Fills gaps so a quiet Tuesday plots as zero rather than vanishing. */
function densify(rows: { day: Date; count: bigint | number }[], days: number): TimePoint[] {
  const byDate = new Map<string, number>();
  for (const row of rows) {
    byDate.set(row.day.toISOString().slice(0, 10), Number(row.count));
  }

  const points: TimePoint[] = [];
  const cursor = startOfDayUtcOffsetDays(days - 1);
  for (let i = 0; i < days; i += 1) {
    const key = cursor.toISOString().slice(0, 10);
    points.push({ date: key, value: byDate.get(key) ?? 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  return points;
}

/**
 * Daily and monthly actives, plus signup and onboarding velocity.
 *
 * "Active" means *placed an order*, not "opened the app". Sessions are recorded
 * (see `UserSessionLog`) but a session is a much weaker signal than a purchase,
 * and reporting the larger number as DAU would flatter the platform for nothing.
 */
export async function getGrowthSeries(days: number = DEFAULT_DAYS) {
  const since = startOfDayUtcOffsetDays(days - 1);
  const monthAgo = startOfDayUtcOffsetDays(30);
  const dayAgo = startOfDayUtcOffsetDays(1);

  const [orderRows, signupRows, merchantRows, revenueRows, dau, mau, sessionsRows] = await Promise.all([
    db.$queryRaw<{ day: Date; count: bigint }[]>`
      SELECT date_trunc('day', "placedAt") AS day, COUNT(*)::bigint AS count
      FROM "Order" WHERE "placedAt" >= ${since}
      GROUP BY day ORDER BY day
    `,
    db.$queryRaw<{ day: Date; count: bigint }[]>`
      SELECT date_trunc('day', "createdAt") AS day, COUNT(*)::bigint AS count
      FROM "User" WHERE "createdAt" >= ${since} AND "role" = 'CUSTOMER'
      GROUP BY day ORDER BY day
    `,
    db.$queryRaw<{ day: Date; count: bigint }[]>`
      SELECT date_trunc('day', "createdAt") AS day, COUNT(*)::bigint AS count
      FROM "Merchant" WHERE "createdAt" >= ${since}
      GROUP BY day ORDER BY day
    `,
    db.$queryRaw<{ day: Date; count: bigint }[]>`
      SELECT date_trunc('day', "placedAt") AS day, COALESCE(SUM("totalMinor"), 0)::bigint AS count
      FROM "Order" WHERE "placedAt" >= ${since} AND "status" = 'PICKED_UP'
      GROUP BY day ORDER BY day
    `,
    db.order.findMany({
      where: { placedAt: { gte: dayAgo } },
      select: { customerId: true },
      distinct: ['customerId'],
    }),
    db.order.findMany({
      where: { placedAt: { gte: monthAgo } },
      select: { customerId: true },
      distinct: ['customerId'],
    }),
    db.$queryRaw<{ day: Date; count: bigint }[]>`
      SELECT date_trunc('day', "startedAt") AS day, COUNT(DISTINCT "userId")::bigint AS count
      FROM "UserSessionLog" WHERE "startedAt" >= ${since}
      GROUP BY day ORDER BY day
    `,
  ]);

  const dauCount = dau.length;
  const mauCount = mau.length;

  return {
    days,
    orders: densify(orderRows, days),
    signups: densify(signupRows, days),
    merchantSignups: densify(merchantRows, days),
    revenueMinor: densify(revenueRows, days),
    /** Distinct users who *signed in* each day — a softer engagement line. */
    activeSessions: densify(sessionsRows, days),
    dau: dauCount,
    mau: mauCount,
    /**
     * Stickiness. Below ~10% a marketplace is a directory people visit when they
     * remember it; above ~25% it is a habit.
     */
    stickiness: mauCount > 0 ? Math.round((dauCount / mauCount) * 100) : 0,
  };
}

export type HourBucket = { hour: number; orders: number; revenueMinor: number };

/**
 * Order distribution across the 24 hours of the day.
 *
 * The two rushes this platform exists for — breakfast around 8–10 AM and the
 * 4–6 PM snack run — are only visible at this resolution. An "orders per day"
 * chart hides them completely.
 */
export async function getPeakHours(days: number = DEFAULT_DAYS): Promise<HourBucket[]> {
  const since = startOfDayUtcOffsetDays(days);

  const rows = await db.$queryRaw<{ hour: number; orders: bigint; revenue: bigint }[]>`
    SELECT EXTRACT(HOUR FROM "placedAt")::int AS hour,
           COUNT(*)::bigint AS orders,
           COALESCE(SUM("totalMinor"), 0)::bigint AS revenue
    FROM "Order" WHERE "placedAt" >= ${since}
    GROUP BY hour ORDER BY hour
  `;

  const byHour = new Map(rows.map((row) => [row.hour, row]));
  return Array.from({ length: 24 }, (_, hour) => {
    const row = byHour.get(hour);
    return {
      hour,
      orders: row ? Number(row.orders) : 0,
      revenueMinor: row ? Number(row.revenue) : 0,
    };
  });
}

export type DemandCell = {
  latitude: number;
  longitude: number;
  orders: number;
  shops: number;
  /** True where customers order but no shop is listed nearby — a recruitment lead. */
  isColdSpot: boolean;
};

/**
 * Demand against supply on a coarse grid.
 *
 * Coordinates are rounded to two decimals (~1.1 km) *before* grouping, which is
 * both what makes the map readable and what stops a single order in a quiet
 * area from pointing at somebody's front door.
 *
 * A cold spot is a cell with real repeat demand and no shop in it. That is the
 * whole expansion signal: it names the streets where a merchant would have
 * customers on day one.
 */
export async function getDemandGrid(days = 60): Promise<DemandCell[]> {
  const since = startOfDayUtcOffsetDays(days);

  const [orderCells, shopCells] = await Promise.all([
    db.$queryRaw<{ lat: number; lng: number; count: bigint }[]>`
      SELECT ROUND("customerLatitude"::numeric, 2)::float8 AS lat,
             ROUND("customerLongitude"::numeric, 2)::float8 AS lng,
             COUNT(*)::bigint AS count
      FROM "Order"
      WHERE "placedAt" >= ${since}
        AND "customerLatitude" IS NOT NULL
        AND "customerLongitude" IS NOT NULL
      GROUP BY lat, lng
    `,
    db.$queryRaw<{ lat: number; lng: number; count: bigint }[]>`
      SELECT ROUND("latitude"::numeric, 2)::float8 AS lat,
             ROUND("longitude"::numeric, 2)::float8 AS lng,
             COUNT(*)::bigint AS count
      FROM "Shop"
      WHERE "isActive" = true AND "isVerified" = true
      GROUP BY lat, lng
    `,
  ]);

  const shopsByCell = new Map(shopCells.map((cell) => [`${cell.lat},${cell.lng}`, Number(cell.count)]));

  const cells: DemandCell[] = orderCells.map((cell) => {
    const shops = shopsByCell.get(`${cell.lat},${cell.lng}`) ?? 0;
    const orders = Number(cell.count);
    return {
      latitude: cell.lat,
      longitude: cell.lng,
      orders,
      shops,
      // Three orders is the floor for calling somewhere a lead: below that it is
      // one person who happened to be passing, not a market.
      isColdSpot: shops === 0 && orders >= 3,
    };
  });

  // Cells that only contain shops still belong on the map — supply with no
  // demand is its own signal, and leaving it out makes coverage look better
  // than it is.
  for (const cell of shopCells) {
    const key = `${cell.lat},${cell.lng}`;
    if (!cells.some((c) => `${c.latitude},${c.longitude}` === key)) {
      cells.push({
        latitude: cell.lat,
        longitude: cell.lng,
        orders: 0,
        shops: Number(cell.count),
        isColdSpot: false,
      });
    }
  }

  return cells.sort((a, b) => b.orders - a.orders);
}

export type ReliabilityRow = {
  shopId: string;
  name: string;
  city: string;
  slug: string;
  completed: number;
  rejected: number;
  cancelled: number;
  totalOrders: number;
  rejectionRate: number;
  /** Actual minus promised preparation minutes. Positive means running late. */
  prepLatency: number | null;
  averagePrepMinutes: number | null;
  averagePromisedMinutes: number | null;
  outOfStockItems: number;
  menuSize: number;
  outOfStockRate: number;
  /** 0–100. Higher is better. */
  score: number;
  flags: string[];
};

/**
 * Merchant reliability leaderboard.
 *
 * Scored on the three things a customer actually feels: being made to wait
 * longer than promised, being turned away after ordering, and finding half the
 * menu unavailable.
 *
 * Shops with very few orders are scored but flagged as thin evidence — ranking a
 * shop last because it rejected its only order so far would be arithmetic, not
 * measurement.
 */
export async function getReliabilityScorecard(days = DEFAULT_DAYS): Promise<ReliabilityRow[]> {
  const since = startOfDayUtcOffsetDays(days);

  const shops = await db.shop.findMany({
    where: { isVerified: true },
    select: { id: true, name: true, city: true, slug: true },
  });
  if (shops.length === 0) return [];

  const shopIds = shops.map((shop) => shop.id);

  const [statusCounts, prepStats, products] = await Promise.all([
    db.order.groupBy({
      by: ['shopId', 'status'],
      where: { shopId: { in: shopIds }, placedAt: { gte: since } },
      _count: { _all: true },
    }),
    db.order.groupBy({
      by: ['shopId'],
      where: { shopId: { in: shopIds }, status: 'PICKED_UP', placedAt: { gte: since } },
      _avg: { actualPrepMinutes: true, promisedPrepMinutes: true },
    }),
    db.product.groupBy({
      by: ['shopId', 'availability'],
      where: { shopId: { in: shopIds } },
      _count: { _all: true },
    }),
  ]);

  const prepByShop = new Map(prepStats.map((row) => [row.shopId, row]));

  const rows: ReliabilityRow[] = shops.map((shop) => {
    const counts = statusCounts.filter((row) => row.shopId === shop.id);
    const countFor = (status: string) =>
      counts.find((row) => row.status === status)?._count._all ?? 0;

    const completed = countFor('PICKED_UP');
    const rejected = countFor('REJECTED');
    const cancelled = countFor('CANCELLED');
    const totalOrders = counts.reduce((sum, row) => sum + row._count._all, 0);

    const prep = prepByShop.get(shop.id);
    const averagePrep = prep?._avg.actualPrepMinutes != null ? Math.round(prep._avg.actualPrepMinutes) : null;
    const averagePromised =
      prep?._avg.promisedPrepMinutes != null ? Math.round(prep._avg.promisedPrepMinutes) : null;
    const prepLatency = averagePrep != null && averagePromised != null ? averagePrep - averagePromised : null;

    const shopProducts = products.filter((row) => row.shopId === shop.id);
    const menuSize = shopProducts.reduce((sum, row) => sum + row._count._all, 0);
    const outOfStockItems = shopProducts
      .filter((row) => row.availability !== 'AVAILABLE')
      .reduce((sum, row) => sum + row._count._all, 0);

    const rejectionRate = totalOrders > 0 ? Math.round((rejected / totalOrders) * 100) : 0;
    const outOfStockRate = menuSize > 0 ? Math.round((outOfStockItems / menuSize) * 100) : 0;

    // Start from perfect and subtract what customers feel. Weights say what the
    // platform believes: being turned away is worse than waiting, and both are
    // worse than a couple of sold-out items.
    let score = 100;
    score -= rejectionRate * 1.5;
    if (prepLatency != null && prepLatency > 0) score -= Math.min(30, prepLatency * 3);
    score -= Math.min(20, outOfStockRate * 0.4);
    score = Math.max(0, Math.min(100, Math.round(score)));

    const flags: string[] = [];
    if (totalOrders < 5) flags.push('Too few orders to judge');
    if (rejectionRate >= 20) flags.push(`Rejects ${rejectionRate}% of orders`);
    if (prepLatency != null && prepLatency >= 5) flags.push(`Runs ${prepLatency} min late on average`);
    if (outOfStockRate >= 30) flags.push(`${outOfStockRate}% of the menu unavailable`);

    return {
      shopId: shop.id,
      name: shop.name,
      city: shop.city,
      slug: shop.slug,
      completed,
      rejected,
      cancelled,
      totalOrders,
      rejectionRate,
      prepLatency,
      averagePrepMinutes: averagePrep,
      averagePromisedMinutes: averagePromised,
      outOfStockItems,
      menuSize,
      outOfStockRate,
      score,
      flags,
    };
  });

  // Shops with enough evidence first, worst score at the top of that group — the
  // list exists to be acted on, not admired.
  return rows.sort((a, b) => {
    const aThin = a.totalOrders < 5;
    const bThin = b.totalOrders < 5;
    if (aThin !== bThin) return aThin ? 1 : -1;
    return a.score - b.score;
  });
}

/**
 * Counter poster versus organic discovery.
 *
 * The comparison the poster budget lives or dies on. Reported per shop as well
 * as platform-wide, because a poster that works in one shop and not in another
 * is a placement problem worth fixing rather than a channel to abandon.
 */
export async function getSourceBreakdown(days = DEFAULT_DAYS) {
  const since = startOfDayUtcOffsetDays(days);

  const [totals, byShop] = await Promise.all([
    db.order.groupBy({
      by: ['source'],
      where: { placedAt: { gte: since } },
      _count: { _all: true },
      _sum: { totalMinor: true },
    }),
    db.order.groupBy({
      by: ['shopId', 'source'],
      where: { placedAt: { gte: since }, source: 'POSTER_QR' },
      _count: { _all: true },
      orderBy: { _count: { shopId: 'desc' } },
      take: 10,
    }),
  ]);

  const total = totals.reduce((sum, row) => sum + row._count._all, 0);
  const posterShopIds = byShop.map((row) => row.shopId);
  const shops =
    posterShopIds.length > 0
      ? await db.shop.findMany({
          where: { id: { in: posterShopIds } },
          select: { id: true, name: true, city: true },
        })
      : [];
  const shopsById = new Map(shops.map((shop) => [shop.id, shop]));

  const countFor = (source: string) => totals.find((row) => row.source === source)?._count._all ?? 0;

  return {
    total,
    app: countFor('APP'),
    posterQr: countFor('POSTER_QR'),
    directLink: countFor('DIRECT_LINK'),
    posterShare: total > 0 ? Math.round((countFor('POSTER_QR') / total) * 100) : 0,
    posterRevenueMinor: totals.find((row) => row.source === 'POSTER_QR')?._sum.totalMinor ?? 0,
    topPosterShops: byShop.map((row) => ({
      shopId: row.shopId,
      name: shopsById.get(row.shopId)?.name ?? 'Unknown shop',
      city: shopsById.get(row.shopId)?.city ?? '',
      orders: row._count._all,
    })),
  };
}

/**
 * One customer, in full — the admin detail view.
 *
 * Deliberately assembled here rather than on the page so the same definition of
 * "lifetime spend" (collected orders only, never placed-and-abandoned ones) is
 * used everywhere it appears.
 */
export async function getCustomerDetail(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      isActive: true,
      createdAt: true,
      lastLoginAt: true,
      loginCount: true,
      customerProfile: true,
    },
  });
  if (!user) return null;

  const [spend, statusCounts, favorites, recentOrders, shopSpend] = await Promise.all([
    db.order.aggregate({
      where: { customerId: userId, status: 'PICKED_UP' },
      _sum: { totalMinor: true, waitMinutesSaved: true },
      _count: { _all: true },
      _avg: { totalMinor: true },
    }),
    db.order.groupBy({
      by: ['status'],
      where: { customerId: userId },
      _count: { _all: true },
    }),
    db.favoriteShop.findMany({
      where: { userId },
      include: { shop: { select: { id: true, name: true, slug: true, city: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    db.order.findMany({
      where: { customerId: userId },
      orderBy: { placedAt: 'desc' },
      take: 15,
      select: {
        id: true,
        code: true,
        status: true,
        source: true,
        totalMinor: true,
        paymentMethod: true,
        placedAt: true,
        shop: { select: { name: true } },
      },
    }),
    db.order.groupBy({
      by: ['shopId'],
      where: { customerId: userId, status: 'PICKED_UP' },
      _count: { _all: true },
      _sum: { totalMinor: true },
      orderBy: { _count: { shopId: 'desc' } },
      take: 5,
    }),
  ]);

  const mostOrderedShopIds = shopSpend.map((row) => row.shopId);
  const mostOrderedShops =
    mostOrderedShopIds.length > 0
      ? await db.shop.findMany({
          where: { id: { in: mostOrderedShopIds } },
          select: { id: true, name: true, slug: true, city: true },
        })
      : [];
  const shopsById = new Map(mostOrderedShops.map((shop) => [shop.id, shop]));

  const countFor = (status: string) => statusCounts.find((row) => row.status === status)?._count._all ?? 0;

  return {
    user,
    lifetimeSpendMinor: spend._sum.totalMinor ?? 0,
    averageOrderMinor: spend._avg.totalMinor ? Math.round(spend._avg.totalMinor) : 0,
    minutesSaved: spend._sum.waitMinutesSaved ?? 0,
    completedOrders: spend._count._all,
    cancelledOrders: countFor('CANCELLED'),
    rejectedOrders: countFor('REJECTED'),
    expiredOrders: countFor('EXPIRED'),
    totalOrders: statusCounts.reduce((sum, row) => sum + row._count._all, 0),
    favoriteShops: favorites.map((favorite) => favorite.shop),
    mostOrderedShops: shopSpend.map((row) => ({
      shopId: row.shopId,
      name: shopsById.get(row.shopId)?.name ?? 'Unknown shop',
      orders: row._count._all,
      spendMinor: row._sum.totalMinor ?? 0,
    })),
    recentOrders,
  };
}
