import { z } from 'zod';
import { db } from '@/lib/db';
import { ok, route } from '@/lib/api';
import { requireShopAccess, requireUser } from '@/lib/auth/guards';
import { isValidUpiId } from '@/lib/domain/upi';

const hoursSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  opensAt: z.number().int().min(0).max(1440),
  closesAt: z.number().int().min(0).max(1440),
  isClosed: z.boolean(),
});

const patchSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  tagline: z.string().trim().max(120).nullable().optional(),
  description: z.string().trim().max(600).nullable().optional(),
  addressLine: z.string().trim().min(4).max(160).optional(),
  phone: z.string().trim().min(6).max(20).optional(),
  basePrepMinutes: z.number().int().min(1).max(180).optional(),
  // `baselineWaitMinutes` is deliberately NOT editable here. It is the divisor
  // behind the platform's headline "waiting time saved" metric, so a merchant
  // who set it to 180 would appear to save three hours per order. Admin-only,
  // via /api/admin/shops/[id].
  maxActiveOrders: z.number().int().min(0).max(500).optional(),
  acceptsCashOnPickup: z.boolean().optional(),
  acceptsOnlinePayment: z.boolean().optional(),
  /**
   * Direct UPI. Validated as a real VPA because a typo here means customers
   * pay a stranger, or nobody, and the shop only finds out when someone
   * complains. An empty string switches UPI off.
   */
  upiId: z
    .string()
    .trim()
    .max(256)
    .refine((value) => value === '' || isValidUpiId(value), 'That is not a valid UPI ID.')
    .optional(),
  upiPayeeName: z.string().trim().max(99).optional(),
  upiDepositPercent: z.number().int().min(5).max(100).optional(),
  allowUpiDeposit: z.boolean().optional(),
  operatingHours: z.array(hoursSchema).max(7).optional(),
});

/** Shop profile, capacity settings and opening hours. */
export const PATCH = route(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  const user = await requireUser(['MERCHANT', 'ADMIN']);
  const { shop } = await requireShopAccess(id, user);

  const { operatingHours, ...fields } = patchSchema.parse(await request.json());

  const updated = await db.$transaction(async (tx) => {
    const result = await tx.shop.update({ where: { id: shop.id }, data: fields });

    if (operatingHours) {
      // Replace wholesale — a partial update would leave contradictory rows for
      // days the merchant removed from the form.
      await tx.shopOperatingHours.deleteMany({ where: { shopId: shop.id } });
      await tx.shopOperatingHours.createMany({
        data: operatingHours.map((h) => ({ ...h, shopId: shop.id })),
      });
    }

    return result;
  });

  return ok({ id: updated.id, name: updated.name });
});
