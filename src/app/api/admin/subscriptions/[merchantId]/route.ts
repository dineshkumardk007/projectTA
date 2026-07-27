import { z } from 'zod';
import { DomainError, ok, route, validateSameOrigin } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import {
  activateManually,
  cancelAtPeriodEnd,
  markExpired,
  setTier,
  startTrial,
} from '@/lib/services/subscription';

/**
 * Phase 1 manual subscription control.
 *
 * One endpoint, an explicit `action`, admin-only. Money arrives by UPI out of
 * band; this is where an admin records that it did and hands back the listing.
 */
const schema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('activate'),
    tier: z.enum(['STARTER', 'PRO', 'ENTERPRISE']).optional(),
    // 30 for a month, 7 for the "extend" button, anything in between by hand.
    days: z.number().int().min(1).max(366).default(30),
    note: z.string().trim().max(280).optional(),
    reference: z.string().trim().max(64).optional(),
    /** False for a goodwill extension that collected nothing. */
    recordPayment: z.boolean().default(true),
  }),
  z.object({ action: z.literal('trial'), tier: z.enum(['STARTER', 'PRO', 'ENTERPRISE']).optional() }),
  z.object({ action: z.literal('expire') }),
  z.object({ action: z.literal('cancel') }),
  z.object({ action: z.literal('tier'), tier: z.enum(['STARTER', 'PRO', 'ENTERPRISE']) }),
]);

export const PATCH = route(async (request: Request, context: { params: Promise<{ merchantId: string }> }) => {
  validateSameOrigin(request);
  const admin = await requireUser(['ADMIN']);
  const { merchantId } = await context.params;
  const body = schema.parse(await request.json());

  switch (body.action) {
    case 'activate': {
      const subscription = await activateManually({
        merchantId,
        tier: body.tier,
        days: body.days,
        note: body.note,
        reference: body.reference,
        recordPayment: body.recordPayment,
        adminUserId: admin.id,
      });
      return ok({
        merchantId,
        status: subscription.status,
        tier: subscription.tier,
        currentPeriodEnd: subscription.currentPeriodEnd,
      });
    }
    case 'trial': {
      const subscription = await startTrial(merchantId, body.tier ?? 'STARTER');
      return ok({ merchantId, status: subscription.status, currentPeriodEnd: subscription.currentPeriodEnd });
    }
    case 'expire': {
      const subscription = await markExpired(merchantId);
      return ok({ merchantId, status: subscription.status });
    }
    case 'cancel': {
      const subscription = await cancelAtPeriodEnd(merchantId);
      return ok({ merchantId, status: subscription.status, currentPeriodEnd: subscription.currentPeriodEnd });
    }
    case 'tier': {
      const subscription = await setTier(merchantId, body.tier);
      return ok({ merchantId, tier: subscription.tier });
    }
    default:
      // Unreachable — the discriminated union covers every branch. Kept so a new
      // action added to the schema fails loudly instead of silently doing nothing.
      throw new DomainError('Unknown subscription action.', 422);
  }
});
