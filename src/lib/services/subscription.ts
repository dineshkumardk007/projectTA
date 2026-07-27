import 'server-only';
import type { MerchantSubscription, SubscriptionTier } from '@prisma/client';
import { db } from '@/lib/db';
import { DomainError } from '@/lib/api';
import {
  daysRemaining,
  describeHealth,
  extendPeriodEnd,
  isPeriodActive,
  monthlyRecurringRevenueMinor,
  planFor,
  priceMinorFor,
} from '@/lib/domain/subscription-plans';

/**
 * Merchant subscription billing.
 *
 * **Phase 1 is manual on purpose.** Below roughly a hundred shops, an admin
 * recording a UPI transfer costs less than a payment-gateway onboarding, a
 * mandate flow and the support load of failed auto-debits. `provider` and
 * `subscriptionRef` are written from the first day so Phase 2 (Razorpay
 * auto-debit, see `api/webhooks/subscriptions`) is a new writer against the same
 * row rather than a migration.
 *
 * **What lapsing does.** An expired subscription hides the merchant's shops from
 * customers (`Shop.isActive = false`). It never touches orders already in
 * flight, never deletes a menu, and is fully reversed by renewal. Losing a
 * listing must be recoverable in one click, because the merchant is usually
 * standing at their counter when they find out.
 */

/** How long a brand-new subscription is free for. */
const TRIAL_DAYS = 14;
const RENEWAL_DAYS = 30;

export type SubscriptionAccess = {
  /** True when the merchant may be listed. Also true when they have no row. */
  isActive: boolean;
  /** Null for a merchant who has never been put on a plan. */
  subscription: MerchantSubscription | null;
  /**
   * True when this merchant is simply not being billed yet — every shop that
   * predates subscriptions. Callers must treat this as "allowed", not "expired".
   */
  isUnbilled: boolean;
};

export async function getSubscriptionAccess(merchantId: string): Promise<SubscriptionAccess> {
  const subscription = await db.merchantSubscription.findUnique({ where: { merchantId } });
  if (!subscription) return { isActive: true, subscription: null, isUnbilled: true };
  return { isActive: isPeriodActive(subscription), subscription, isUnbilled: false };
}

/**
 * The access check, in the shape the brief asked for.
 *
 * A merchant with no subscription row returns `true`: they are not on a plan, so
 * there is nothing to have expired. Anything stricter would switch off every
 * existing shop the moment this code deployed.
 */
export async function isSubscriptionActive(merchantId: string): Promise<boolean> {
  return (await getSubscriptionAccess(merchantId)).isActive;
}

/**
 * Hides shops whose subscription has lapsed and restores those whose has not.
 *
 * Both directions run in one sweep so the two can never disagree. Returns what
 * it changed, which is what the admin console reports back.
 *
 * Only shops carrying `deactivatedBySubscription` are ever restored — a shop an
 * admin hid for a hygiene complaint stays hidden through any number of renewals.
 */
export async function syncSubscriptionShopVisibility(): Promise<{ hidden: number; restored: number }> {
  const now = new Date();

  const subscriptions = await db.merchantSubscription.findMany({
    select: { merchantId: true, status: true, tier: true, currentPeriodEnd: true },
  });
  if (subscriptions.length === 0) return { hidden: 0, restored: 0 };

  const lapsed: string[] = [];
  const current: string[] = [];
  for (const subscription of subscriptions) {
    (isPeriodActive(subscription, now) ? current : lapsed).push(subscription.merchantId);
  }

  const [hidden, restored] = await Promise.all([
    lapsed.length > 0
      ? db.shop.updateMany({
          where: { merchantId: { in: lapsed }, isActive: true },
          data: { isActive: false, deactivatedBySubscription: true },
        })
      : Promise.resolve({ count: 0 }),
    current.length > 0
      ? db.shop.updateMany({
          where: { merchantId: { in: current }, deactivatedBySubscription: true },
          data: { isActive: true, deactivatedBySubscription: false },
        })
      : Promise.resolve({ count: 0 }),
  ]);

  // Keep the stored status honest once a period has run out, so an admin list
  // sorted by status matches what customers can actually see.
  if (lapsed.length > 0) {
    await db.merchantSubscription.updateMany({
      where: { merchantId: { in: lapsed }, status: { in: ['TRIALING', 'ACTIVE', 'PAST_DUE'] } },
      data: { status: 'EXPIRED' },
    });
  }

  return { hidden: hidden.count, restored: restored.count };
}

/**
 * Throttled wrapper for hot paths.
 *
 * Discovery must not run a platform-wide sweep on every request, and expiry is
 * not urgent to the minute — a shop staying listed for a few extra minutes on
 * the day it lapses is a far smaller problem than a slow home page. The admin
 * console calls `syncSubscriptionShopVisibility` directly when it wants an
 * immediate answer.
 */
const SWEEP_INTERVAL_MS = 10 * 60_000;
let lastSweepAt = 0;
let inFlight: Promise<unknown> | null = null;

export function sweepExpiredSubscriptions(): void {
  const now = Date.now();
  if (inFlight || now - lastSweepAt < SWEEP_INTERVAL_MS) return;
  lastSweepAt = now;
  inFlight = syncSubscriptionShopVisibility()
    .catch((error) => {
      // Never let billing housekeeping break a customer's page load.
      console.warn('[subscription] visibility sweep failed', error);
    })
    .finally(() => {
      inFlight = null;
    });
}

// ---------------------------------------------------------------------------
// Admin actions (Phase 1 — manual activation)
// ---------------------------------------------------------------------------

export type ManualActivationInput = {
  merchantId: string;
  tier?: SubscriptionTier;
  /** Days to add. 30 for a month's activation, 7 for a goodwill extension. */
  days?: number;
  /** "Paid ₹399 via UPI ref 123456789012" — free text, shown in the audit log. */
  note?: string;
  /** UPI reference or receipt number. */
  reference?: string;
  /** Set false for a goodwill extension that collected no money. */
  recordPayment?: boolean;
  adminUserId: string;
};

/**
 * Records an offline payment and pushes the period forward.
 *
 * The payment row and the period move together in one transaction: an admin who
 * is told the extension worked must never find the receipt missing, and a
 * receipt must never exist for time nobody got.
 */
export async function activateManually(input: ManualActivationInput) {
  const days = input.days ?? RENEWAL_DAYS;
  if (!Number.isInteger(days) || days < 1 || days > 366) {
    throw new DomainError('Choose between 1 and 366 days.', 422, 'invalid_days');
  }

  const merchant = await db.merchant.findUnique({
    where: { id: input.merchantId },
    select: { id: true, subscription: true },
  });
  if (!merchant) throw new DomainError('That merchant could not be found.', 404);

  const now = new Date();
  const existing = merchant.subscription;
  const tier = input.tier ?? existing?.tier ?? 'STARTER';
  const periodEnd = extendPeriodEnd(existing?.currentPeriodEnd ?? null, days, now);
  const periodStart = existing && existing.currentPeriodEnd > now ? existing.currentPeriodStart : now;

  const subscription = await db.$transaction(async (tx) => {
    const saved = await tx.merchantSubscription.upsert({
      where: { merchantId: merchant.id },
      create: {
        merchantId: merchant.id,
        tier,
        status: 'ACTIVE',
        provider: 'manual',
        subscriptionRef: input.reference ?? null,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        note: input.note ?? null,
      },
      update: {
        tier,
        status: 'ACTIVE',
        provider: existing?.provider === 'razorpay' ? 'razorpay' : 'manual',
        subscriptionRef: input.reference ?? existing?.subscriptionRef ?? null,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        cancelledAt: null,
        note: input.note ?? existing?.note ?? null,
      },
    });

    if (input.recordPayment !== false) {
      await tx.subscriptionPayment.create({
        data: {
          subscriptionId: saved.id,
          amountMinor: priceMinorFor(tier),
          tier,
          provider: 'manual',
          // Namespaced so a UPI reference recorded here cannot collide with a
          // gateway payment id in Phase 2.
          providerRef: input.reference ? `manual:${input.reference}` : null,
          note: input.note ?? null,
          periodStart: saved.currentPeriodStart,
          periodEnd: saved.currentPeriodEnd,
          recordedByUserId: input.adminUserId,
        },
      });
    }

    // Restore the merchant's own shops immediately — an admin who has just been
    // handed cash should not wait ten minutes for the sweep.
    await tx.shop.updateMany({
      where: { merchantId: merchant.id, deactivatedBySubscription: true },
      data: { isActive: true, deactivatedBySubscription: false },
    });

    return saved;
  });

  return subscription;
}

/** Starts a free trial. Used when an admin onboards a merchant before any money moves. */
export async function startTrial(merchantId: string, tier: SubscriptionTier = 'STARTER') {
  const now = new Date();
  const trialEnd = extendPeriodEnd(null, TRIAL_DAYS, now);

  return db.merchantSubscription.upsert({
    where: { merchantId },
    create: {
      merchantId,
      tier,
      status: 'TRIALING',
      provider: 'manual',
      trialEndsAt: trialEnd,
      currentPeriodStart: now,
      currentPeriodEnd: trialEnd,
    },
    // Never restart a trial someone has already used.
    update: {},
  });
}

/** Ends access now. Used for non-payment, not for a merchant's own cancellation. */
export async function markExpired(merchantId: string) {
  const subscription = await db.merchantSubscription.findUnique({ where: { merchantId } });
  if (!subscription) throw new DomainError('That merchant is not on a plan yet.', 404);

  const now = new Date();
  const [updated] = await db.$transaction([
    db.merchantSubscription.update({
      where: { merchantId },
      data: { status: 'EXPIRED', currentPeriodEnd: now },
    }),
    db.shop.updateMany({
      where: { merchantId, isActive: true },
      data: { isActive: false, deactivatedBySubscription: true },
    }),
  ]);

  return updated;
}

/**
 * Cancels at period end.
 *
 * The merchant keeps what they paid for — `currentPeriodEnd` is untouched, and
 * the sweep hides their shops when it arrives. Cutting access off on the day
 * someone cancels would be taking money for time not served.
 */
export async function cancelAtPeriodEnd(merchantId: string) {
  const subscription = await db.merchantSubscription.findUnique({ where: { merchantId } });
  if (!subscription) throw new DomainError('That merchant is not on a plan yet.', 404);

  return db.merchantSubscription.update({
    where: { merchantId },
    data: { status: 'CANCELLED', cancelledAt: new Date() },
  });
}

export async function setTier(merchantId: string, tier: SubscriptionTier) {
  const subscription = await db.merchantSubscription.findUnique({ where: { merchantId } });
  if (!subscription) throw new DomainError('That merchant is not on a plan yet.', 404);

  return db.merchantSubscription.update({ where: { merchantId }, data: { tier } });
}

// ---------------------------------------------------------------------------
// Read models
// ---------------------------------------------------------------------------

export type MerchantSubscriptionRow = {
  merchantId: string;
  businessName: string;
  contactEmail: string;
  contactPhone: string;
  verificationStatus: string;
  shopCount: number;
  visibleShopCount: number;
  tier: SubscriptionTier | null;
  tierName: string | null;
  priceMinor: number;
  status: string;
  health: 'active' | 'trialing' | 'expiring' | 'expired' | 'cancelled' | 'unbilled';
  provider: string | null;
  subscriptionRef: string | null;
  currentPeriodEnd: Date | null;
  daysRemaining: number | null;
  note: string | null;
};

/** Every merchant, on a plan or not — the admin console's main table. */
export async function listMerchantSubscriptions(): Promise<MerchantSubscriptionRow[]> {
  const now = new Date();

  const merchants = await db.merchant.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      businessName: true,
      contactPhone: true,
      verificationStatus: true,
      user: { select: { email: true } },
      subscription: true,
      shops: { select: { isActive: true } },
    },
  });

  return merchants.map((merchant) => {
    const subscription = merchant.subscription;
    const plan = subscription ? planFor(subscription.tier) : null;

    return {
      merchantId: merchant.id,
      businessName: merchant.businessName,
      contactEmail: merchant.user.email,
      contactPhone: merchant.contactPhone,
      verificationStatus: merchant.verificationStatus,
      shopCount: merchant.shops.length,
      visibleShopCount: merchant.shops.filter((shop) => shop.isActive).length,
      tier: subscription?.tier ?? null,
      tierName: plan?.name ?? null,
      priceMinor: plan?.priceMinor ?? 0,
      status: subscription?.status ?? 'NOT_ON_A_PLAN',
      health: subscription ? describeHealth(subscription, now) : 'unbilled',
      provider: subscription?.provider ?? null,
      subscriptionRef: subscription?.subscriptionRef ?? null,
      currentPeriodEnd: subscription?.currentPeriodEnd ?? null,
      daysRemaining: subscription ? daysRemaining(subscription.currentPeriodEnd, now) : null,
      note: subscription?.note ?? null,
    };
  });
}

/**
 * The SaaS headline block.
 *
 * MRR counts only subscriptions that are currently entitled, so it reflects
 * money the platform can expect next month rather than every row ever created.
 */
export async function getSubscriptionOverview() {
  const now = new Date();

  const startOfMonth = new Date(now);
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [subscriptions, totalMerchants, collectedThisMonth, collectedAllTime] = await Promise.all([
    db.merchantSubscription.findMany({ select: { tier: true, status: true, currentPeriodEnd: true } }),
    db.merchant.count(),
    db.subscriptionPayment.aggregate({
      where: { createdAt: { gte: startOfMonth } },
      _sum: { amountMinor: true },
      _count: { _all: true },
    }),
    db.subscriptionPayment.aggregate({ _sum: { amountMinor: true }, _count: { _all: true } }),
  ]);

  const active = subscriptions.filter((subscription) => isPeriodActive(subscription, now));
  const expiringSoon = active.filter((s) => daysRemaining(s.currentPeriodEnd, now) <= 5);

  const byTier = new Map<SubscriptionTier, number>();
  for (const subscription of active) {
    byTier.set(subscription.tier, (byTier.get(subscription.tier) ?? 0) + 1);
  }

  return {
    mrrMinor: monthlyRecurringRevenueMinor(active),
    arrMinor: monthlyRecurringRevenueMinor(active) * 12,
    activeSubscriptions: active.length,
    expiredSubscriptions: subscriptions.length - active.length,
    expiringSoon: expiringSoon.length,
    trialing: active.filter((s) => s.status === 'TRIALING').length,
    /** Merchants who have never been put on a plan — the Phase 1 sales pipeline. */
    unbilledMerchants: totalMerchants - subscriptions.length,
    totalMerchants,
    collectedThisMonthMinor: collectedThisMonth._sum.amountMinor ?? 0,
    collectedThisMonthCount: collectedThisMonth._count._all,
    collectedAllTimeMinor: collectedAllTime._sum.amountMinor ?? 0,
    collectedAllTimeCount: collectedAllTime._count._all,
    tierCounts: {
      STARTER: byTier.get('STARTER') ?? 0,
      PRO: byTier.get('PRO') ?? 0,
      ENTERPRISE: byTier.get('ENTERPRISE') ?? 0,
    },
  };
}

/** The manual payment history log. */
export async function listSubscriptionPayments(limit = 50) {
  const payments = await db.subscriptionPayment.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      subscription: {
        select: { merchant: { select: { id: true, businessName: true } } },
      },
    },
  });

  return payments.map((payment) => ({
    id: payment.id,
    merchantId: payment.subscription.merchant.id,
    businessName: payment.subscription.merchant.businessName,
    amountMinor: payment.amountMinor,
    tier: payment.tier,
    provider: payment.provider,
    reference: payment.providerRef,
    note: payment.note,
    periodStart: payment.periodStart,
    periodEnd: payment.periodEnd,
    createdAt: payment.createdAt,
  }));
}

/** The merchant's own billing view. */
export async function getBillingSummary(merchantId: string) {
  const [access, payments] = await Promise.all([
    getSubscriptionAccess(merchantId),
    db.subscriptionPayment.findMany({
      where: { subscription: { merchantId } },
      orderBy: { createdAt: 'desc' },
      take: 12,
    }),
  ]);

  const now = new Date();
  const subscription = access.subscription;

  return {
    isUnbilled: access.isUnbilled,
    isActive: access.isActive,
    plan: subscription ? planFor(subscription.tier) : null,
    status: subscription?.status ?? null,
    health: subscription ? describeHealth(subscription, now) : ('unbilled' as const),
    trialEndsAt: subscription?.trialEndsAt ?? null,
    currentPeriodEnd: subscription?.currentPeriodEnd ?? null,
    daysRemaining: subscription ? daysRemaining(subscription.currentPeriodEnd, now) : null,
    provider: subscription?.provider ?? null,
    payments,
  };
}
