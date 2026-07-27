import { z } from 'zod';
import { db } from '@/lib/db';
import { DomainError, ok, route } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';

const schema = z
  .object({
    isActive: z.boolean().optional(),
    /**
     * Fraud guard. Blocks cash-on-pickup for this customer platform-wide; they
     * may still order, but must pay before the shop starts cooking.
     */
    isCashOnPickupBlocked: z.boolean().optional(),
  })
  .refine((body) => body.isActive !== undefined || body.isCashOnPickupBlocked !== undefined, {
    message: 'Nothing to change.',
  });

/**
 * Account state and payment restrictions.
 *
 * Bumping `tokenVersion` on deactivation invalidates every session that user
 * already holds — otherwise a banned account keeps working until its JWT
 * expires, which could be weeks.
 */
export const PATCH = route(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  const admin = await requireUser(['ADMIN']);
  const { id } = await context.params;
  const body = schema.parse(await request.json());

  if (id === admin.id && body.isActive === false) {
    throw new DomainError('You cannot deactivate your own account.', 409, 'self_target');
  }

  const user = await db.user.findUnique({ where: { id }, select: { id: true } });
  if (!user) throw new DomainError('That user could not be found.', 404);

  if (body.isCashOnPickupBlocked !== undefined) {
    // `updateMany` rather than `update`: a merchant or admin account has no
    // customer profile, and blocking cash for one is a no-op rather than a 500.
    const changed = await db.customerProfile.updateMany({
      where: { userId: user.id },
      data: { isCashOnPickupBlocked: body.isCashOnPickupBlocked },
    });
    if (changed.count === 0) {
      throw new DomainError('That account has no customer profile to restrict.', 409, 'not_a_customer');
    }
  }

  const updated =
    body.isActive !== undefined
      ? await db.user.update({
          where: { id: user.id },
          data: { isActive: body.isActive, ...(body.isActive ? {} : { tokenVersion: { increment: 1 } }) },
          select: { id: true, isActive: true },
        })
      : { id: user.id, isActive: undefined };

  return ok({
    id: updated.id,
    isActive: updated.isActive,
    isCashOnPickupBlocked: body.isCashOnPickupBlocked,
  });
});
