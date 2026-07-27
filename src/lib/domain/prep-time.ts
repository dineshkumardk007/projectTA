import type { ShopStatus } from '@prisma/client';

/**
 * Preparation-time estimation.
 *
 * This is the number the whole product is judged on, so it is deliberately
 * conservative and explainable rather than clever:
 *
 *     estimate = max(item prep times)
 *              + queue delay (orders already in the kitchen)
 *              × busy multiplier (what the merchant says right now)
 *
 * `max` rather than `sum` of item prep times because a tea and a dosa are made
 * in parallel, not one after the other. A small per-extra-item surcharge keeps
 * large orders honest.
 *
 * Section 13 of the product spec calls for historical/predictive estimation
 * later; `estimatePrepMinutes` is the single seam where that lands. Everything
 * else in the codebase asks this function rather than doing its own arithmetic.
 */

/** How much longer things take when the merchant flags a rush. */
export const BUSY_MULTIPLIER: Record<ShopStatus, number> = {
  OPEN: 1,
  BUSY: 1.6,
  VERY_BUSY: 2.4,
  PAUSED: 1,
  CLOSED: 1,
};

export const SHOP_STATUS_LABEL: Record<ShopStatus, string> = {
  OPEN: 'Open',
  BUSY: 'Busy',
  VERY_BUSY: 'Very busy',
  PAUSED: 'Not taking orders',
  CLOSED: 'Closed',
};

/** Extra minutes added per item beyond the first, to model counter throughput. */
const PER_EXTRA_ITEM_MINUTES = 0.6;

/** Each order already in the kitchen pushes a new order back by this much. */
const PER_QUEUED_ORDER_MINUTES = 2.5;

/** Never promise less than this — nothing is instant. */
const FLOOR_MINUTES = 3;

export type PrepEstimateInput = {
  /** Prep minutes for each *unit* ordered (a quantity of 3 contributes 3 entries). */
  itemPrepMinutes: number[];
  /** Fallback when the cart is empty (browsing a shop page). */
  basePrepMinutes: number;
  /** Orders in ACCEPTED or PREPARING at this shop right now. */
  activeOrderCount: number;
  status: ShopStatus;
};

export type PrepEstimate = {
  /** Single best-guess number of minutes. */
  minutes: number;
  /** Customer-facing range, always shown rather than a false-precision number. */
  rangeLow: number;
  rangeHigh: number;
  /** Minutes attributable purely to the queue — powers "2 orders ahead of you". */
  queueMinutes: number;
};

export function estimatePrepMinutes(input: PrepEstimateInput): PrepEstimate {
  const { itemPrepMinutes, basePrepMinutes, activeOrderCount, status } = input;

  const baseWork =
    itemPrepMinutes.length > 0
      ? Math.max(...itemPrepMinutes) + Math.max(0, itemPrepMinutes.length - 1) * PER_EXTRA_ITEM_MINUTES
      : basePrepMinutes;

  const queueMinutes = Math.max(0, activeOrderCount) * PER_QUEUED_ORDER_MINUTES;
  const multiplier = BUSY_MULTIPLIER[status] ?? 1;

  const raw = (baseWork + queueMinutes) * multiplier;
  const minutes = Math.max(FLOOR_MINUTES, Math.round(raw));

  // A ±25% band, rounded to friendly 5-minute-ish boundaries.
  const rangeLow = Math.max(FLOOR_MINUTES, Math.round(minutes * 0.8));
  const rangeHigh = Math.max(rangeLow + 3, Math.round(minutes * 1.25));

  return {
    minutes,
    rangeLow,
    rangeHigh,
    queueMinutes: Math.round(queueMinutes * multiplier),
  };
}

/** "Ready in 10–15 min" */
export function formatPrepRange(estimate: Pick<PrepEstimate, 'rangeLow' | 'rangeHigh'>): string {
  if (estimate.rangeLow === estimate.rangeHigh) return `${estimate.rangeLow} min`;
  return `${estimate.rangeLow}–${estimate.rangeHigh} min`;
}

/** "6:25 PM" — the single most important number on the checkout screen. */
export function formatClockTime(date: Date): string {
  return date.toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * A bare hour of the day as "4PM" — for peak-hour axes and tables.
 *
 * Lives here, in a module with no `'use client'` and no `server-only`, because
 * both the client charts and the server-rendered tables beside them need it.
 * A copy inside a client component cannot be called from a server component at
 * all, and two copies would eventually disagree about midnight.
 */
export function formatHourOfDay(hour: number): string {
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const normalised = hour % 12 === 0 ? 12 : hour % 12;
  return `${normalised}${suffix}`;
}

export type TravelSync = {
  /** How the customer's arrival lines up with the food being ready. */
  verdict: 'perfect' | 'wait-for-order' | 'order-waits' | 'unknown';
  headline: string;
  detail: string;
};

/**
 * The differentiating idea from section 14: compare travel time against
 * preparation time and tell the customer plainly what will happen when they
 * arrive. Honesty here is worth more than an optimistic estimate.
 */
export function describeTravelSync(
  etaMinutes: number | null | undefined,
  prepMinutes: number,
): TravelSync {
  if (etaMinutes == null || !Number.isFinite(etaMinutes)) {
    return {
      verdict: 'unknown',
      headline: "We'll notify you when it's ready",
      detail: 'Turn on location to see how your travel time lines up with preparation.',
    };
  }

  const gap = etaMinutes - prepMinutes;

  if (Math.abs(gap) <= 3) {
    return {
      verdict: 'perfect',
      headline: 'Perfect timing',
      detail: `You are about ${etaMinutes} min away and your order takes about ${prepMinutes} min. It should be ready as you arrive.`,
    };
  }

  if (gap < 0) {
    return {
      verdict: 'wait-for-order',
      headline: `You may wait about ${Math.round(-gap)} min`,
      detail: `You are ${etaMinutes} min away but preparation takes about ${prepMinutes} min. Leaving a little later means no waiting at all.`,
    };
  }

  return {
    verdict: 'order-waits',
    headline: 'Your order will be waiting for you',
    detail: `Preparation takes about ${prepMinutes} min and you are ${etaMinutes} min away. Pick up as soon as you arrive.`,
  };
}
