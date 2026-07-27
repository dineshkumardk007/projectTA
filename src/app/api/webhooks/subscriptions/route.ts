import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { fail, ok, route } from '@/lib/api';
import { logger } from '@/lib/logger';
import { extendPeriodEnd, priceMinorFor } from '@/lib/domain/subscription-plans';
import { syncSubscriptionShopVisibility } from '@/lib/services/subscription';

/**
 * Phase 2 — Razorpay subscription auto-debit.
 *
 * Wired and inert. Nothing routes merchants into a Razorpay mandate yet; this
 * exists so that switching Phase 1 off is a configuration change and a signup
 * flow, not a schema migration and a rewrite of billing. Until
 * `RAZORPAY_WEBHOOK_SECRET` is set it rejects everything, which is the correct
 * behaviour for an endpoint nobody has pointed a gateway at.
 *
 * What it must get right, and what the code below is mostly about:
 *
 *  1. **Verify before parsing.** The signature is computed over the *raw* body.
 *     Parsing first and re-serialising changes bytes and breaks the HMAC — and
 *     an unverified webhook is just a stranger telling us a merchant paid.
 *  2. **Be idempotent.** Gateways retry. `SubscriptionPayment.providerRef` is
 *     unique, so a replayed `subscription.charged` records one payment and
 *     extends one period, however many times it arrives.
 *  3. **Never trust the amount for entitlement.** The period is extended by the
 *     billing cycle, not by whatever number is in the payload.
 */

/** Razorpay signs the raw request body with HMAC-SHA256. */
function isSignatureValid(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const providedBuffer = Buffer.from(signature, 'utf8');

  // Length must match before `timingSafeEqual`, which throws on a mismatch.
  if (expectedBuffer.length !== providedBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

type RazorpayEvent = {
  event?: string;
  payload?: {
    subscription?: { entity?: { id?: string; current_end?: number; status?: string } };
    payment?: { entity?: { id?: string; amount?: number } };
  };
};

/** Razorpay sends seconds; JavaScript wants milliseconds. */
function fromUnixSeconds(seconds: number | undefined): Date | null {
  if (!seconds || !Number.isFinite(seconds)) return null;
  return new Date(seconds * 1000);
}

export const POST = route(async (request: Request) => {
  const secret = env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    // Not "unauthorised" — the endpoint is genuinely not in service.
    return fail('Subscription webhooks are not enabled.', 503, 'not_configured');
  }

  const rawBody = await request.text();
  const signature = request.headers.get('x-razorpay-signature');

  if (!isSignatureValid(rawBody, signature, secret)) {
    logger.warn('[webhook:subscriptions] rejected an unsigned or mis-signed request');
    return fail('Invalid signature.', 401, 'invalid_signature');
  }

  let event: RazorpayEvent;
  try {
    event = JSON.parse(rawBody) as RazorpayEvent;
  } catch {
    return fail('Malformed payload.', 400, 'malformed');
  }

  const subscriptionRef = event.payload?.subscription?.entity?.id;
  if (!subscriptionRef) {
    // Acknowledged, not retried: an event we do not handle is not a failure on
    // the gateway's part, and 4xx-ing it would have Razorpay redelivering
    // forever.
    return ok({ ignored: true, reason: 'no subscription id' });
  }

  const subscription = await db.merchantSubscription.findFirst({
    where: { subscriptionRef, provider: 'razorpay' },
  });
  if (!subscription) {
    logger.warn('[webhook:subscriptions] unknown subscription', { subscriptionRef });
    return ok({ ignored: true, reason: 'unknown subscription' });
  }

  switch (event.event) {
    case 'subscription.charged': {
      const paymentRef = event.payload?.payment?.entity?.id ?? null;

      // Trust the gateway's own period end when it sends one; otherwise add a
      // month. Either way the *amount* in the payload never decides entitlement.
      const periodEnd =
        fromUnixSeconds(event.payload?.subscription?.entity?.current_end) ??
        extendPeriodEnd(subscription.currentPeriodEnd, 30);

      await db.$transaction(async (tx) => {
        await tx.merchantSubscription.update({
          where: { id: subscription.id },
          data: {
            status: 'ACTIVE',
            currentPeriodStart: subscription.currentPeriodEnd,
            currentPeriodEnd: periodEnd,
            cancelledAt: null,
          },
        });

        if (paymentRef) {
          // Unique `providerRef` makes the retry a no-op rather than a
          // double-charge in the ledger.
          const existing = await tx.subscriptionPayment.findUnique({
            where: { providerRef: `razorpay:${paymentRef}` },
            select: { id: true },
          });
          if (!existing) {
            await tx.subscriptionPayment.create({
              data: {
                subscriptionId: subscription.id,
                amountMinor: event.payload?.payment?.entity?.amount ?? priceMinorFor(subscription.tier),
                tier: subscription.tier,
                provider: 'razorpay',
                providerRef: `razorpay:${paymentRef}`,
                periodStart: subscription.currentPeriodEnd,
                periodEnd,
              },
            });
          }
        }

        await tx.shop.updateMany({
          where: { merchantId: subscription.merchantId, deactivatedBySubscription: true },
          data: { isActive: true, deactivatedBySubscription: false },
        });
      });

      return ok({ handled: 'subscription.charged' });
    }

    case 'subscription.halted':
    case 'subscription.pending': {
      // A failed auto-debit. The shop stays listed until the paid period runs
      // out — a card that failed this morning is not grounds for switching off
      // a shop that is mid-service.
      await db.merchantSubscription.update({
        where: { id: subscription.id },
        data: { status: 'PAST_DUE' },
      });
      return ok({ handled: event.event });
    }

    case 'subscription.cancelled': {
      await db.merchantSubscription.update({
        where: { id: subscription.id },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      });
      // Visibility is decided by the period end, which is untouched: they keep
      // what they paid for.
      await syncSubscriptionShopVisibility();
      return ok({ handled: 'subscription.cancelled' });
    }

    case 'subscription.completed': {
      await db.merchantSubscription.update({
        where: { id: subscription.id },
        data: { status: 'EXPIRED' },
      });
      await syncSubscriptionShopVisibility();
      return ok({ handled: 'subscription.completed' });
    }

    default:
      return ok({ ignored: true, event: event.event ?? 'unknown' });
  }
});
