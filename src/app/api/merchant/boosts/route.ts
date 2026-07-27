import { z } from 'zod';
import { ok, route, validateSameOrigin } from '@/lib/api';
import { requireShopAccess, requireUser } from '@/lib/auth/guards';
import { purchaseBoost } from '@/lib/services/boosts';
import { boostPriceMinor } from '@/lib/domain/boost-plans';

/**
 * A merchant activating a boost for their own shop.
 *
 * `requireShopAccess` is the gate — without it any signed-in merchant could
 * boost a competitor's shop and bill it to them.
 *
 * Price comes from `boostPriceMinor`, never from the request. The merchant is
 * recording a UPI transfer they have already made; a client-supplied amount
 * would let anyone buy a week of promotion for one rupee.
 */
const schema = z.object({
  shopId: z.string().min(1),
  durationDays: z.union([z.literal(1), z.literal(3), z.literal(7)]),
  slotType: z.enum(['HOME_HERO', 'CATEGORY_TOP', 'SEARCH_PINNED']).optional(),
  paymentRef: z.string().trim().max(64).optional(),
});

export const POST = route(async (request: Request) => {
  validateSameOrigin(request);
  const user = await requireUser(['MERCHANT', 'ADMIN']);

  const body = schema.parse(await request.json());
  await requireShopAccess(body.shopId, user);

  const boost = await purchaseBoost({
    shopId: body.shopId,
    durationDays: body.durationDays,
    slotType: body.slotType,
    paymentRef: body.paymentRef,
    amountPaidMinorOverride: boostPriceMinor(body.durationDays) ?? undefined,
  });

  return ok(
    {
      id: boost.id,
      slotType: boost.slotType,
      startsAt: boost.startsAt,
      endsAt: boost.endsAt,
      amountPaidMinor: boost.amountPaidMinor,
    },
    201,
  );
});
