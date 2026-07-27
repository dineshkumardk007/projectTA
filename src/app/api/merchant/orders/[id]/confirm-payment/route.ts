import { z } from 'zod';
import { db } from '@/lib/db';
import { DomainError, ok, route } from '@/lib/api';
import { requireShopAccess, requireUser } from '@/lib/auth/guards';
import { confirmUpiPayment } from '@/lib/services/upi';

/**
 * The shop confirming — or denying — that a UPI payment actually arrived.
 *
 * This is the only route to PAID for a UPI order. It exists because nothing
 * else can know: the money moved directly between the customer's bank and the
 * shop's, with no system in between to ask.
 */
const schema = z.object({
  paymentId: z.string().min(1).optional(),
  received: z.boolean(),
  note: z.string().trim().max(200).optional(),
});

export const POST = route(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  const user = await requireUser(['MERCHANT', 'STAFF', 'ADMIN']);
  const body = schema.parse(await request.json());

  const order = await db.order.findUnique({ where: { id }, select: { id: true, shopId: true } });
  if (!order) throw new DomainError('That order could not be found.', 404);

  await requireShopAccess(order.shopId, user);

  const result = await confirmUpiPayment({
    orderId: order.id,
    paymentId: body.paymentId,
    actorUserId: user.id,
    received: body.received,
    note: body.note,
  });

  return ok(result);
});
