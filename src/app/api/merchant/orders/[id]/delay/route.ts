import { z } from 'zod';
import { db } from '@/lib/db';
import { DomainError, ok, route } from '@/lib/api';
import { requireShopAccess, requireUser } from '@/lib/auth/guards';
import { delayOrder } from '@/lib/services/orders';

const schema = z.object({ extraMinutes: z.number().int().min(1).max(120) });

/** Push back the promised ready time and tell the customer why. */
export const POST = route(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  const user = await requireUser(['MERCHANT', 'STAFF', 'ADMIN']);
  const body = schema.parse(await request.json());

  const order = await db.order.findUnique({ where: { id }, select: { id: true, shopId: true } });
  if (!order) throw new DomainError('That order could not be found.', 404);

  await requireShopAccess(order.shopId, user);
  const updated = await delayOrder(order.id, body.extraMinutes, user.id);

  return ok({ id: updated.id, estimatedReadyAt: updated.estimatedReadyAt });
});
