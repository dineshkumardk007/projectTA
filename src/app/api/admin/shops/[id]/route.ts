import { z } from 'zod';
import { db } from '@/lib/db';
import { DomainError, ok, route } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';

const schema = z.object({
  isActive: z.boolean().optional(),
  isVerified: z.boolean().optional(),
  /**
   * Admin-only on purpose. This is the divisor behind the platform's headline
   * "waiting time saved" metric, so letting a merchant set it would let them
   * inflate the number the whole business case rests on.
   */
  baselineWaitMinutes: z.number().int().min(1).max(180).optional(),
});

/** Admin override for listing a shop or taking it off the platform. */
export const PATCH = route(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  await requireUser(['ADMIN']);
  const { id } = await context.params;
  const body = schema.parse(await request.json());

  const shop = await db.shop.findUnique({ where: { id }, select: { id: true } });
  if (!shop) throw new DomainError('That shop could not be found.', 404);

  const updated = await db.shop.update({ where: { id: shop.id }, data: body });
  return ok({
    id: updated.id,
    isActive: updated.isActive,
    isVerified: updated.isVerified,
    baselineWaitMinutes: updated.baselineWaitMinutes,
  });
});
