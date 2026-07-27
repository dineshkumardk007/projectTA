import 'server-only';
import type { BoostSlotType, ShopFeaturedBoost } from '@prisma/client';
import { db } from '@/lib/db';
import { DomainError } from '@/lib/api';
import { boostEndsAt, boostPackageFor, isBoostLive } from '@/lib/domain/boost-plans';

/**
 * Daily-pay featured shop boosts.
 *
 * Like subscriptions, money arrives out-of-band in Phase 1: the merchant sends
 * ₹99 by UPI and an admin (or the merchant, recording their own reference)
 * creates the boost. `paymentRef` carries whatever proof exists, so the same
 * function serves a gateway callback later without changing shape.
 *
 * **A boost re-orders, it never reveals.** Every discovery query still filters
 * on active, verified and open before this module gets a say. A shop cannot buy
 * its way past a lapsed subscription or into a closed evening.
 */

export type PurchaseBoostInput = {
  shopId: string;
  durationDays: number;
  slotType?: BoostSlotType;
  paymentRef?: string;
  /** Set by the admin console when it is recording an offline payment. */
  amountPaidMinorOverride?: number;
};

export async function purchaseBoost(input: PurchaseBoostInput): Promise<ShopFeaturedBoost> {
  const pkg = boostPackageFor(input.durationDays);
  if (!pkg) throw new DomainError('Choose a 1, 3 or 7 day boost.', 422, 'invalid_duration');

  const shop = await db.shop.findUnique({
    where: { id: input.shopId },
    select: { id: true, isVerified: true },
  });
  if (!shop) throw new DomainError('That shop could not be found.', 404);
  if (!shop.isVerified) {
    throw new DomainError('Your shop needs to be verified before it can be boosted.', 409, 'not_verified');
  }

  // Stacking boosts would let a shop pay twice for one position. Extend the one
  // it already has instead, so the second ₹99 buys a second day rather than
  // nothing.
  const existing = await findLiveBoost(input.shopId);
  const startsAt = new Date();

  if (existing) {
    const extended = await db.shopFeaturedBoost.update({
      where: { id: existing.id },
      data: {
        endsAt: boostEndsAt(pkg.durationDays, existing.endsAt),
        durationDays: existing.durationDays + pkg.durationDays,
        amountPaidMinor: existing.amountPaidMinor + (input.amountPaidMinorOverride ?? pkg.priceMinor),
        paymentRef: input.paymentRef ?? existing.paymentRef,
        ...(input.slotType ? { slotType: input.slotType } : {}),
      },
    });
    return extended;
  }

  return db.shopFeaturedBoost.create({
    data: {
      shopId: shop.id,
      slotType: input.slotType ?? 'SEARCH_PINNED',
      startsAt,
      endsAt: boostEndsAt(pkg.durationDays, startsAt),
      durationDays: pkg.durationDays,
      amountPaidMinor: input.amountPaidMinorOverride ?? pkg.priceMinor,
      paymentRef: input.paymentRef ?? null,
    },
  });
}

/** The shop's currently-running boost, if any. */
export async function findLiveBoost(shopId: string): Promise<ShopFeaturedBoost | null> {
  const now = new Date();
  return db.shopFeaturedBoost.findFirst({
    where: { shopId, isActive: true, startsAt: { lte: now }, endsAt: { gt: now } },
    orderBy: { endsAt: 'desc' },
  });
}

/**
 * Which of these shops are boosted right now, and in which slot.
 *
 * One query for the whole page rather than one per card — discovery renders
 * sixty shops and cannot afford sixty round trips.
 */
export async function getLiveBoostsForShops(shopIds: string[]): Promise<Map<string, BoostSlotType>> {
  if (shopIds.length === 0) return new Map();

  const now = new Date();
  const boosts = await db.shopFeaturedBoost.findMany({
    where: { shopId: { in: shopIds }, isActive: true, startsAt: { lte: now }, endsAt: { gt: now } },
    select: { shopId: true, slotType: true, endsAt: true },
    orderBy: { endsAt: 'desc' },
  });

  const result = new Map<string, BoostSlotType>();
  for (const boost of boosts) {
    if (!result.has(boost.shopId)) result.set(boost.shopId, boost.slotType);
  }
  return result;
}

/** Admin/merchant kill switch. Ending a boost never deletes the sale record. */
export async function setBoostActive(boostId: string, isActive: boolean): Promise<ShopFeaturedBoost> {
  const boost = await db.shopFeaturedBoost.findUnique({ where: { id: boostId } });
  if (!boost) throw new DomainError('That boost could not be found.', 404);
  return db.shopFeaturedBoost.update({ where: { id: boostId }, data: { isActive } });
}

export async function listBoostsForShop(shopId: string, limit = 20) {
  return db.shopFeaturedBoost.findMany({
    where: { shopId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

/** The admin boost ledger: what is running now, and what it has earned. */
export async function getBoostOverview() {
  const now = new Date();

  const startOfMonth = new Date(now);
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [live, revenueThisMonth, revenueAllTime, recent] = await Promise.all([
    db.shopFeaturedBoost.findMany({
      where: { isActive: true, startsAt: { lte: now }, endsAt: { gt: now } },
      include: { shop: { select: { id: true, name: true, city: true, slug: true } } },
      orderBy: { endsAt: 'asc' },
    }),
    db.shopFeaturedBoost.aggregate({
      where: { createdAt: { gte: startOfMonth } },
      _sum: { amountPaidMinor: true },
      _count: { _all: true },
    }),
    db.shopFeaturedBoost.aggregate({ _sum: { amountPaidMinor: true }, _count: { _all: true } }),
    db.shopFeaturedBoost.findMany({
      orderBy: { createdAt: 'desc' },
      take: 25,
      include: { shop: { select: { id: true, name: true, city: true } } },
    }),
  ]);

  return {
    liveBoosts: live.map((boost) => ({
      id: boost.id,
      shopId: boost.shop.id,
      shopName: boost.shop.name,
      city: boost.shop.city,
      slotType: boost.slotType,
      endsAt: boost.endsAt,
      amountPaidMinor: boost.amountPaidMinor,
    })),
    liveCount: live.length,
    revenueThisMonthMinor: revenueThisMonth._sum.amountPaidMinor ?? 0,
    soldThisMonth: revenueThisMonth._count._all,
    revenueAllTimeMinor: revenueAllTime._sum.amountPaidMinor ?? 0,
    soldAllTime: revenueAllTime._count._all,
    recent: recent.map((boost) => ({
      id: boost.id,
      shopId: boost.shop.id,
      shopName: boost.shop.name,
      city: boost.shop.city,
      slotType: boost.slotType,
      startsAt: boost.startsAt,
      endsAt: boost.endsAt,
      durationDays: boost.durationDays,
      amountPaidMinor: boost.amountPaidMinor,
      paymentRef: boost.paymentRef,
      isActive: boost.isActive,
      isLive: isBoostLive(boost, now),
    })),
  };
}
