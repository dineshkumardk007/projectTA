import { z } from 'zod';
import { db } from '@/lib/db';
import { DomainError, ok, route } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';

const schema = z.object({ isActive: z.boolean() });

/**
 * Activate or deactivate an account.
 *
 * Bumping `tokenVersion` on deactivation invalidates every session that user
 * already holds — otherwise a banned account keeps working until its JWT
 * expires, which could be weeks.
 */
export const PATCH = route(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  const admin = await requireUser(['ADMIN']);
  const { id } = await context.params;
  const body = schema.parse(await request.json());

  if (id === admin.id) {
    throw new DomainError('You cannot deactivate your own account.', 409, 'self_target');
  }

  const user = await db.user.findUnique({ where: { id }, select: { id: true } });
  if (!user) throw new DomainError('That user could not be found.', 404);

  const updated = await db.user.update({
    where: { id: user.id },
    data: { isActive: body.isActive, ...(body.isActive ? {} : { tokenVersion: { increment: 1 } }) },
  });

  return ok({ id: updated.id, isActive: updated.isActive });
});
