import { z } from 'zod';
import { db } from '@/lib/db';
import { DomainError, ok, route } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { customerCancellation } from '@/lib/domain/order-status';
import { transitionOrder } from '@/lib/services/orders';

const schema = z.object({ reason: z.string().trim().max(200).optional() });

/** Customer-initiated cancellation, subject to the published policy. */
export const POST = route(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  const user = await requireUser(['CUSTOMER']);
  const body = schema.parse(await request.json().catch(() => ({})));

  const order = await db.order.findUnique({
    where: { id },
    select: { id: true, status: true, customerId: true },
  });
  if (!order) throw new DomainError('That order could not be found.', 404);
  if (order.customerId !== user.id) throw new DomainError('You do not have access to this order.', 403);

  const policy = customerCancellation(order.status);
  if (!policy.allowed) throw new DomainError(policy.reason, 409, 'cancellation_not_allowed');

  const updated = await transitionOrder({
    orderId: order.id,
    to: 'CANCELLED',
    actor: 'CUSTOMER',
    actorUserId: user.id,
    note: body.reason ?? 'Cancelled by customer',
  });

  return ok({ id: updated.id, status: updated.status });
});
