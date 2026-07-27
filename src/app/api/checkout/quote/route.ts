import { z } from 'zod';
import { db } from '@/lib/db';
import { DomainError, ok, route } from '@/lib/api';
import { cartItemSchema, coordinatesSchema } from '@/lib/validation';
import { countActiveOrders, priceCart } from '@/lib/services/orders';
import { estimatePrepMinutes } from '@/lib/domain/prep-time';
import { getOrderability } from '@/lib/domain/shop-availability';
import { getMapsProvider } from '@/lib/providers/maps.server';
import { depositForTotal } from '@/lib/domain/upi';

/**
 * Checkout quote.
 *
 * The checkout screen must show exactly what placing the order will do — the
 * same pricing and the same estimate, computed by the same functions. Anything
 * that would make the order fail (an item gone out of stock while browsing, the
 * shop pausing) surfaces here rather than after the customer taps "Place order".
 */
const schema = z.object({
  shopId: z.string().min(1),
  items: z.array(cartItemSchema).min(1),
  customerLocation: coordinatesSchema.optional(),
});

export const POST = route(async (request: Request) => {
  const body = schema.parse(await request.json());

  const shop = await db.shop.findUnique({
    where: { id: body.shopId },
    include: { operatingHours: true },
  });
  if (!shop) throw new DomainError('That shop could not be found.', 404);

  const activeOrders = await countActiveOrders(shop.id);
  const orderability = getOrderability({
    status: shop.status,
    isActive: shop.isActive,
    isVerified: shop.isVerified,
    hours: shop.operatingHours,
    atCapacity: shop.maxActiveOrders > 0 && activeOrders >= shop.maxActiveOrders,
  });

  const cart = await priceCart(shop.id, body.items);

  const estimate = estimatePrepMinutes({
    itemPrepMinutes: cart.itemPrepMinutes,
    basePrepMinutes: shop.basePrepMinutes,
    activeOrderCount: activeOrders,
    status: shop.status,
  });

  let travelMinutes: number | null = null;
  let distanceKm: number | null = null;
  if (body.customerLocation) {
    const travel = await getMapsProvider().estimateTravel(body.customerLocation, shop, 'walking');
    travelMinutes = travel.durationMinutes;
    distanceKm = travel.distanceKm;
  }

  return ok({
    shop: {
      id: shop.id,
      name: shop.name,
      slug: shop.slug,
      addressLine: shop.addressLine,
      city: shop.city,
      acceptsCashOnPickup: shop.acceptsCashOnPickup,
      acceptsOnlinePayment: shop.acceptsOnlinePayment,
      // Direct UPI is available purely on the shop having entered a UPI ID —
      // there is no onboarding or gateway account behind it.
      acceptsUpi: Boolean(shop.upiId),
      allowUpiDeposit: shop.allowUpiDeposit,
      upiDepositPercent: shop.upiDepositPercent,
      upiDepositMinor: shop.upiId ? depositForTotal(cart.totalMinor, shop.upiDepositPercent) : 0,
    },
    orderability,
    lines: cart.lines,
    subtotalMinor: cart.subtotalMinor,
    totalMinor: cart.totalMinor,
    prep: {
      minutes: estimate.minutes,
      rangeLow: estimate.rangeLow,
      rangeHigh: estimate.rangeHigh,
      queueMinutes: estimate.queueMinutes,
    },
    estimatedReadyAt: new Date(Date.now() + estimate.minutes * 60_000).toISOString(),
    ordersAhead: activeOrders,
    travelMinutes,
    distanceKm,
  });
});
