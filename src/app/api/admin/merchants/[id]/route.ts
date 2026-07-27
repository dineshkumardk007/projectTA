import { z } from 'zod';
import { db } from '@/lib/db';
import { DomainError, ok, route } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { notify } from '@/lib/services/notifications';

const schema = z.object({
  verificationStatus: z.enum(['PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED']),
  note: z.string().trim().max(300).optional(),
});

/**
 * Merchant verification.
 *
 * Verifying a merchant also flips their shops visible, because "approved but
 * still invisible to customers" is the kind of half-state that generates
 * support tickets. Suspending reverses both.
 */
export const PATCH = route(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  await requireUser(['ADMIN']);
  const { id } = await context.params;
  const body = schema.parse(await request.json());

  const merchant = await db.merchant.findUnique({ where: { id }, select: { id: true, userId: true } });
  if (!merchant) throw new DomainError('That merchant could not be found.', 404);

  const verified = body.verificationStatus === 'VERIFIED';

  const updated = await db.$transaction(async (tx) => {
    const result = await tx.merchant.update({
      where: { id: merchant.id },
      data: {
        verificationStatus: body.verificationStatus,
        verificationNote: body.note,
        verifiedAt: verified ? new Date() : null,
      },
    });

    await tx.shop.updateMany({
      where: { merchantId: merchant.id },
      data: {
        isVerified: verified,
        ...(body.verificationStatus === 'SUSPENDED' ? { isActive: false, status: 'PAUSED' as const } : {}),
      },
    });

    return result;
  });

  await notify({
    userId: merchant.userId,
    type: 'SYSTEM',
    title: verified ? 'Your shop is live on Takeaway' : `Account status: ${body.verificationStatus.toLowerCase()}`,
    body: verified
      ? 'Customers can now find your shop and place pre-orders.'
      : body.note ?? 'Please contact support for details.',
    href: '/merchant',
  });

  return ok({ id: updated.id, verificationStatus: updated.verificationStatus });
});
