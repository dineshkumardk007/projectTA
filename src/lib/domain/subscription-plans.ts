/**
 * Subscription pricing and period arithmetic.
 *
 * Pure and dependency-free — no database, no `server-only` — so the merchant's
 * billing screen, the admin console and the tests all compute "days remaining"
 * and "next renewal" with exactly the same code. A billing page that disagrees
 * with the access check by one day is how support tickets start.
 *
 * Prices are integer paise, like every other amount in the system.
 */

import type { SubscriptionStatus, SubscriptionTier } from '@prisma/client';

export type PlanDefinition = {
  tier: SubscriptionTier;
  name: string;
  priceMinor: number;
  /** One line the merchant reads before choosing. */
  summary: string;
  features: string[];
};

export const SUBSCRIPTION_PLANS: readonly PlanDefinition[] = [
  {
    tier: 'STARTER',
    name: 'Starter',
    priceMinor: 39_900,
    summary: 'One shop, the full order board.',
    features: [
      'One listed shop',
      'Unlimited orders — no commission, ever',
      'Order board, pickup QR and counter poster',
      'UPI and cash-on-pickup collection',
    ],
  },
  {
    tier: 'PRO',
    name: 'Pro',
    priceMinor: 89_900,
    summary: 'Several shops, plus the numbers behind them.',
    features: [
      'Up to five listed shops',
      'Everything in Starter',
      'Preparation accuracy and peak-hour analytics',
      'Staff accounts for the counter',
      'Priority support',
    ],
  },
  {
    tier: 'ENTERPRISE',
    name: 'Enterprise',
    priceMinor: 149_900,
    summary: 'Chains, with a boost included every month.',
    features: [
      'Unlimited listed shops',
      'Everything in Pro',
      'One 7-day featured boost included each month',
      'Named account contact',
    ],
  },
] as const;

const PLANS_BY_TIER = new Map(SUBSCRIPTION_PLANS.map((plan) => [plan.tier, plan]));

export function planFor(tier: SubscriptionTier): PlanDefinition {
  const plan = PLANS_BY_TIER.get(tier);
  // Every enum member has a plan; the fallback exists so an enum added later
  // cannot crash a merchant's billing page before its plan is written.
  return plan ?? SUBSCRIPTION_PLANS[0];
}

export function priceMinorFor(tier: SubscriptionTier): number {
  return planFor(tier).priceMinor;
}

/** Statuses that grant access, *if* the period has not also run out. */
const ENTITLED_STATUSES: readonly SubscriptionStatus[] = ['TRIALING', 'ACTIVE'];

export type PeriodView = {
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  currentPeriodEnd: Date;
};

/**
 * The single access rule: an entitled status **and** an unexpired period.
 *
 * Both halves are required. Status alone goes stale the moment a period lapses
 * without anyone touching the row, and a date alone would keep a cancelled
 * merchant live until their paid-up period ran out — which is right for
 * cancellation but wrong for suspension, so status stays in the check.
 */
export function isPeriodActive(subscription: PeriodView, now: Date = new Date()): boolean {
  return ENTITLED_STATUSES.includes(subscription.status) && subscription.currentPeriodEnd.getTime() > now.getTime();
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Whole days left, floored at zero.
 *
 * Rounded *up*, so a subscription with six hours left reads "1 day remaining"
 * rather than "0". Telling a merchant they have zero days while their shop is
 * still listed is the kind of small dishonesty that costs a renewal.
 */
export function daysRemaining(currentPeriodEnd: Date, now: Date = new Date()): number {
  const ms = currentPeriodEnd.getTime() - now.getTime();
  if (ms <= 0) return 0;
  return Math.ceil(ms / MS_PER_DAY);
}

/**
 * Where a new period should end when `days` are added.
 *
 * Extends from whichever is later: the existing period end, or now. Renewing
 * early therefore *adds* to what a merchant already paid for instead of
 * silently discarding it — the difference matters most to the merchants who pay
 * ahead of time, who are exactly the ones to keep.
 */
export function extendPeriodEnd(currentPeriodEnd: Date | null, days: number, now: Date = new Date()): Date {
  const base = currentPeriodEnd && currentPeriodEnd.getTime() > now.getTime() ? currentPeriodEnd : now;
  return new Date(base.getTime() + days * MS_PER_DAY);
}

/** Monthly recurring revenue in paise across the given active subscriptions. */
export function monthlyRecurringRevenueMinor(subscriptions: readonly { tier: SubscriptionTier }[]): number {
  return subscriptions.reduce((total, subscription) => total + priceMinorFor(subscription.tier), 0);
}

export type SubscriptionHealth = 'active' | 'trialing' | 'expiring' | 'expired' | 'cancelled';

/** How the row should be labelled in a list. `expiring` is a nudge, not a state. */
export function describeHealth(subscription: PeriodView, now: Date = new Date()): SubscriptionHealth {
  if (subscription.status === 'CANCELLED') return 'cancelled';
  if (!isPeriodActive(subscription, now)) return 'expired';
  if (daysRemaining(subscription.currentPeriodEnd, now) <= 5) return 'expiring';
  return subscription.status === 'TRIALING' ? 'trialing' : 'active';
}
