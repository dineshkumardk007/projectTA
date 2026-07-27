import 'server-only';
import type { BoostSlotType, Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { estimatePrepMinutes } from '@/lib/domain/prep-time';
import { getOrderability, type Orderability } from '@/lib/domain/shop-availability';
import { haversineKm, type LatLng } from '@/lib/providers/maps';
import { ACTIVE_STATUSES } from '@/lib/domain/order-status';
import { shopLocalDate } from '@/lib/domain/local-date';
import { getLiveBoostsForShops } from '@/lib/services/boosts';
import { sweepExpiredSubscriptions } from '@/lib/services/subscription';

/**
 * Read models for shop discovery.
 *
 * The shop card needs live state (is it open, how busy, how long is the queue)
 * that no single table holds, so it is assembled here once and shared by the
 * home page, the shop list and search. Doing it in one place is also what keeps
 * the estimate a customer sees on a card identical to the one on the shop page.
 */

export type ShopSummary = {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  tags: string[];
  categoryName: string;
  categoryEmoji: string;
  coverImageUrl: string | null;
  logoImageUrl: string | null;
  addressLine: string;
  city: string;
  latitude: number;
  longitude: number;
  orderability: Orderability;
  prepRangeLow: number;
  prepRangeHigh: number;
  prepMinutes: number;
  activeOrders: number;
  distanceKm: number | null;
  isFavorite: boolean;
  /**
   * Set when the shop has paid for a featured slot that is running right now.
   * Drives both the "Featured today" badge and the pin to the top of the list.
   */
  featuredSlot: BoostSlotType | null;
  popularItems: string[];
  /**
   * What the shop is pushing today. Surfaced on the discovery card as tappable
   * chips so a customer can go straight to the item instead of opening the shop
   * and hunting through the menu.
   */
  todaysSpecials: { id: string; name: string; priceMinor: number; note: string | null }[];
};

export type DiscoveryFilters = {
  categorySlug?: string;
  query?: string;
  openNow?: boolean;
  readyFast?: boolean;
  favoritesOnly?: boolean;
  sort?: 'nearest' | 'fastest' | 'popular';
};

const SHOP_INCLUDE = {
  category: true,
  operatingHours: true,
  products: {
    // Both the long-running favourites and anything flagged for today. Filtered
    // apart below, because "special today" depends on the shop's own local date
    // and cannot be expressed in this shared include.
    where: {
      availability: 'AVAILABLE' as const,
      OR: [{ isPopular: true }, { NOT: { specialOn: '' } }],
    },
    select: { id: true, name: true, priceMinor: true, isPopular: true, specialOn: true, specialNote: true },
    orderBy: { sortOrder: 'asc' as const },
  },
} satisfies Prisma.ShopInclude;

/** "Ready fast" means the shop can have an order out within this many minutes. */
const READY_FAST_THRESHOLD_MINUTES = 12;

export async function listShops(options: {
  filters?: DiscoveryFilters;
  location?: LatLng | null;
  viewerId?: string | null;
  limit?: number;
}): Promise<ShopSummary[]> {
  const { filters = {}, location = null, viewerId = null, limit = 60 } = options;

  // Fire-and-forget, throttled to once every ten minutes: hides shops whose
  // subscription has lapsed and restores those that have renewed. Deliberately
  // not awaited — discovery must not wait on billing housekeeping.
  sweepExpiredSubscriptions();

  /**
   * Everything that *can* be expressed as a query goes into the query.
   *
   * The filters used to run in JavaScript after `take: limit`, which meant that
   * past `limit` shops "Open now" silently returned an incomplete list — the
   * database handed back an arbitrary 60 shops and the filter then discarded
   * some of them. Narrowing in SQL means the limit applies to shops the customer
   * could actually order from.
   *
   * Two things still cannot be pushed down, and both are handled explicitly
   * below rather than pretended away:
   *   • opening hours, which live in a child table as minute offsets
   *   • "ready fast", which depends on the computed preparation estimate
   */
  const where: Prisma.ShopWhereInput = {
    isActive: true,
    isVerified: true,
    ...(filters.categorySlug ? { category: { slug: filters.categorySlug } } : {}),
    // A paused or closed shop can never satisfy "open now".
    ...(filters.openNow ? { status: { in: ['OPEN', 'BUSY', 'VERY_BUSY'] } } : {}),
    ...(filters.favoritesOnly && viewerId ? { favorites: { some: { userId: viewerId } } } : {}),
    ...(filters.query
      ? {
          OR: [
            { name: { contains: filters.query, mode: 'insensitive' } },
            { tagline: { contains: filters.query, mode: 'insensitive' } },
            { tags: { hasSome: [filters.query] } },
            // Matching on menu items is what makes searching "dosa" useful.
            { products: { some: { name: { contains: filters.query, mode: 'insensitive' } } } },
          ],
        }
      : {}),
  };

  // Signed-out visitors have no favourites, so the filter can only be empty.
  if (filters.favoritesOnly && !viewerId) return [];

  const shops = await db.shop.findMany({ where, include: SHOP_INCLUDE, take: limit });
  if (shops.length === 0) return [];

  const shopIds = shops.map((shop) => shop.id);

  const [favorites, activeCounts, boostedShops] = await Promise.all([
    viewerId
      ? db.favoriteShop.findMany({
          where: { userId: viewerId, shopId: { in: shopIds } },
          select: { shopId: true },
        })
      : Promise.resolve([]),
    // Scoped to the shops actually being rendered. Previously this aggregated
    // every active order on the platform on every discovery request.
    db.order.groupBy({
      by: ['shopId'],
      where: { shopId: { in: shopIds }, status: { in: ACTIVE_STATUSES } },
      _count: { _all: true },
    }),
    getLiveBoostsForShops(shopIds),
  ]);

  const favoriteIds = new Set(favorites.map((f) => f.shopId));
  const activeByShop = new Map(activeCounts.map((row) => [row.shopId, row._count._all]));

  let summaries: ShopSummary[] = shops.map((shop) => {
    const activeOrders = activeByShop.get(shop.id) ?? 0;

    const orderability = getOrderability({
      status: shop.status,
      isActive: shop.isActive,
      isVerified: shop.isVerified,
      hours: shop.operatingHours,
      atCapacity: shop.maxActiveOrders > 0 && activeOrders >= shop.maxActiveOrders,
    });

    const estimate = estimatePrepMinutes({
      itemPrepMinutes: [],
      basePrepMinutes: shop.basePrepMinutes,
      activeOrderCount: activeOrders,
      status: shop.status,
    });

    return {
      id: shop.id,
      slug: shop.slug,
      name: shop.name,
      tagline: shop.tagline,
      tags: shop.tags,
      categoryName: shop.category.name,
      categoryEmoji: shop.category.emoji,
      coverImageUrl: shop.coverImageUrl,
      logoImageUrl: shop.logoImageUrl,
      addressLine: shop.addressLine,
      city: shop.city,
      latitude: shop.latitude,
      longitude: shop.longitude,
      orderability,
      prepRangeLow: estimate.rangeLow,
      prepRangeHigh: estimate.rangeHigh,
      prepMinutes: estimate.minutes,
      activeOrders,
      distanceKm: location ? Number(haversineKm(location, shop).toFixed(2)) : null,
      isFavorite: favoriteIds.has(shop.id),
      featuredSlot: boostedShops.get(shop.id) ?? null,
      popularItems: shop.products.filter((p) => p.isPopular).slice(0, 3).map((p) => p.name),
      // `specialOn` holds the date the item was flagged for, so a stale flag
      // simply stops matching once the shop's day rolls over — no cleanup job.
      todaysSpecials: shop.products
        .filter((p) => p.specialOn === shopLocalDate(shop.timeZone))
        .slice(0, 3)
        .map((p) => ({ id: p.id, name: p.name, priceMinor: p.priceMinor, note: p.specialNote })),
    };
  });

  // The residue that genuinely cannot be expressed in SQL: opening hours are
  // per-day minute offsets in a child table, and "ready fast" depends on the
  // computed estimate. Both only ever narrow an already-narrowed set.
  if (filters.openNow) summaries = summaries.filter((s) => s.orderability.canOrder);
  if (filters.readyFast) summaries = summaries.filter((s) => s.prepMinutes <= READY_FAST_THRESHOLD_MINUTES);

  const sort = filters.sort ?? (location ? 'nearest' : 'fastest');
  summaries.sort((a, b) => {
    // Shops that cannot take an order right now always sort last, whatever the
    // chosen order — showing a closed shop first wastes the customer's time.
    if (a.orderability.canOrder !== b.orderability.canOrder) return a.orderability.canOrder ? -1 : 1;

    // Paid placement ranks *below* orderability and nothing else. A boosted shop
    // that is closed, or too far to be useful, still sorts behind one that can
    // actually hand the customer their tea — the slot is worth selling only for
    // as long as customers keep trusting the list.
    const aFeatured = a.featuredSlot != null;
    const bFeatured = b.featuredSlot != null;
    if (aFeatured !== bFeatured) return aFeatured ? -1 : 1;

    if (sort === 'nearest' && a.distanceKm != null && b.distanceKm != null) {
      return a.distanceKm - b.distanceKm;
    }
    if (sort === 'popular') return b.activeOrders - a.activeOrders;
    return a.prepMinutes - b.prepMinutes;
  });

  return summaries;
}

export async function getShopBySlug(slug: string, viewerId?: string | null) {
  const shop = await db.shop.findUnique({
    where: { slug },
    include: {
      category: true,
      operatingHours: { orderBy: { dayOfWeek: 'asc' } },
      menuCategories: { orderBy: { sortOrder: 'asc' } },
      products: {
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        include: { optionGroups: { orderBy: { sortOrder: 'asc' }, include: { options: { orderBy: { sortOrder: 'asc' } } } } },
      },
    },
  });

  if (!shop || !shop.isActive || !shop.isVerified) return null;

  const activeOrders = await db.order.count({
    where: { shopId: shop.id, status: { in: ACTIVE_STATUSES } },
  });

  const orderability = getOrderability({
    status: shop.status,
    isActive: shop.isActive,
    isVerified: shop.isVerified,
    hours: shop.operatingHours,
    atCapacity: shop.maxActiveOrders > 0 && activeOrders >= shop.maxActiveOrders,
  });

  const estimate = estimatePrepMinutes({
    itemPrepMinutes: [],
    basePrepMinutes: shop.basePrepMinutes,
    activeOrderCount: activeOrders,
    status: shop.status,
  });

  const isFavorite = viewerId
    ? (await db.favoriteShop.findUnique({
        where: { userId_shopId: { userId: viewerId, shopId: shop.id } },
      })) != null
    : false;

  // Resolved once here rather than in the page, so "special today" means the
  // same thing on the shop page as it does on the discovery card.
  const todayForShop = shopLocalDate(shop.timeZone);

  return { shop, orderability, estimate, activeOrders, isFavorite, todayForShop };
}

export async function listCategories() {
  return db.category.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } });
}
