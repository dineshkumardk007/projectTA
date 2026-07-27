import { z } from 'zod';
import { ok, route, validateSameOrigin } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { purchaseBoost } from '@/lib/services/boosts';

/**
 * Admin-recorded boost sale.
 *
 * The merchant pays ₹99 by UPI at the counter and an admin records it here.
 * `amountPaidMinor` may be overridden so a discounted or comped boost is stored
 * as what was actually collected, not as list price — the boost revenue figure
 * is only useful if it is true.
 */
const schema = z.object({
  shopId: z.string().min(1),
  durationDays: z.union([z.literal(1), z.literal(3), z.literal(7)]),
  slotType: z.enum(['HOME_HERO', 'CATEGORY_TOP', 'SEARCH_PINNED']).optional(),
  paymentRef: z.string().trim().max(64).optional(),
  amountPaidMinor: z.number().int().min(0).max(1_000_000).optional(),
});

export const POST = route(async (request: Request) => {
  validateSameOrigin(request);
  await requireUser(['ADMIN']);

  const body = schema.parse(await request.json());

  const boost = await purchaseBoost({
    shopId: body.shopId,
    durationDays: body.durationDays,
    slotType: body.slotType,
    paymentRef: body.paymentRef,
    amountPaidMinorOverride: body.amountPaidMinor,
  });

  return ok(
    {
      id: boost.id,
      shopId: boost.shopId,
      slotType: boost.slotType,
      startsAt: boost.startsAt,
      endsAt: boost.endsAt,
      amountPaidMinor: boost.amountPaidMinor,
    },
    201,
  );
});
