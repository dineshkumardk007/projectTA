import { z } from 'zod';
import { db } from '@/lib/db';
import { DomainError, ok, route } from '@/lib/api';
import { requireShopAccess, requireUser } from '@/lib/auth/guards';
import { transitionOrder } from '@/lib/services/orders';

/**
 * The merchant's single order-action endpoint.
 *
 * Accept, start preparing, mark ready, confirm pickup, reject and cancel all
 * come through here so they share one authorisation check and one state-machine
 * check. `requireShopAccess` is what stops one merchant touching another
 * merchant's orders — the order id in the URL grants nothing on its own.
 */
const schema = z.object({
  to: z.enum(['ACCEPTED', 'PREPARING', 'READY', 'PICKED_UP', 'REJECTED', 'CANCELLED']),
  note: z.string().trim().max(200).optional(),
  finalTotalMinor: z.number().int().min(0).optional(),
  verificationMethod: z.enum(['QR', 'ORDER_CODE', 'MANUAL']).optional(),
});

export const POST = route(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  const user = await requireUser(['MERCHANT', 'STAFF', 'ADMIN']);
  const body = schema.parse(await request.json());

  const order = await db.order.findUnique({ where: { id }, select: { id: true, shopId: true } });
  if (!order) throw new DomainError('That order could not be found.', 404);

  await requireShopAccess(order.shopId, user);

  const updated = await transitionOrder({
    orderId: order.id,
    to: body.to,
    actor: 'SHOP',
    actorUserId: user.id,
    note: body.note,
    finalTotalMinor: body.finalTotalMinor,
    verificationMethod: body.verificationMethod,
  });

  return ok({ id: updated.id, status: updated.status, code: updated.code });
});
