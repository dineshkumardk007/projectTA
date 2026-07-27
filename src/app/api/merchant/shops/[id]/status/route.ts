import { z } from 'zod';
import { db } from '@/lib/db';
import { ok, route } from '@/lib/api';
import { requireShopAccess, requireUser } from '@/lib/auth/guards';
import { estimatePrepMinutes } from '@/lib/domain/prep-time';
import { countActiveOrders } from '@/lib/services/orders';

const schema = z.object({
  status: z.enum(['OPEN', 'BUSY', 'VERY_BUSY', 'PAUSED', 'CLOSED']),
  note: z.string().trim().max(120).optional(),
});

/**
 * One-tap busy control.
 *
 * Returns the recalculated preparation estimate so the dashboard can show the
 * merchant exactly what they just promised customers ("10 min → 20 min").
 */
export const POST = route(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  const user = await requireUser(['MERCHANT', 'STAFF', 'ADMIN']);
  const { shop } = await requireShopAccess(id, user);

  const body = schema.parse(await request.json());
  const activeOrders = await countActiveOrders(shop.id);

  const before = estimatePrepMinutes({
    itemPrepMinutes: [],
    basePrepMinutes: shop.basePrepMinutes,
    activeOrderCount: activeOrders,
    status: shop.status,
  });

  const updated = await db.shop.update({
    where: { id: shop.id },
    data: { status: body.status, statusNote: body.note, statusSetAt: new Date() },
  });

  const after = estimatePrepMinutes({
    itemPrepMinutes: [],
    basePrepMinutes: updated.basePrepMinutes,
    activeOrderCount: activeOrders,
    status: updated.status,
  });

  return ok({
    status: updated.status,
    previousPrepMinutes: before.minutes,
    prepMinutes: after.minutes,
  });
});
