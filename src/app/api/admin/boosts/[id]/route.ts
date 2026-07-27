import { z } from 'zod';
import { ok, route, validateSameOrigin } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { setBoostActive } from '@/lib/services/boosts';

const schema = z.object({ isActive: z.boolean() });

/**
 * Switch a boost on or off.
 *
 * Never deletes: the sale happened, and a refunded or cancelled boost still has
 * to reconcile against the money that came in.
 */
export const PATCH = route(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  validateSameOrigin(request);
  await requireUser(['ADMIN']);

  const { id } = await context.params;
  const body = schema.parse(await request.json());

  const boost = await setBoostActive(id, body.isActive);
  return ok({ id: boost.id, isActive: boost.isActive });
});
