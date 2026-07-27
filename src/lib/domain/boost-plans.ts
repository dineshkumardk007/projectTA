/**
 * Featured-boost pricing and window arithmetic.
 *
 * Pure, like `subscription-plans` and for the same reason: the merchant's
 * purchase screen quotes the price, the API charges it, and the tests check it —
 * all from this one table.
 *
 * Boosts are sold by the day, not by impression or click. A ₹99 flat rate is
 * something a shop owner can decide on at the counter in ten seconds; a variable
 * bill is something they take home to think about and never come back to.
 */

import type { BoostSlotType } from '@prisma/client';

export type BoostPackage = {
  durationDays: 1 | 3 | 7;
  label: string;
  priceMinor: number;
  /** Shown next to the price so the saving is visible without arithmetic. */
  note: string;
};

export const BOOST_PACKAGES: readonly BoostPackage[] = [
  { durationDays: 1, label: '1 day', priceMinor: 9_900, note: 'Try it for today' },
  { durationDays: 3, label: '3 days', priceMinor: 24_900, note: '₹83 a day — save ₹48' },
  { durationDays: 7, label: '7 days', priceMinor: 49_900, note: '₹71 a day — save ₹194' },
] as const;

export const BOOST_SLOTS: readonly { slotType: BoostSlotType; label: string; description: string }[] = [
  {
    slotType: 'SEARCH_PINNED',
    label: 'Pinned in search',
    description: 'First result when a customer searches or browses a category.',
  },
  {
    slotType: 'CATEGORY_TOP',
    label: 'Top of your category',
    description: 'First shop shown to anyone browsing your category.',
  },
  {
    slotType: 'HOME_HERO',
    label: 'Home page hero',
    description: 'Featured card at the top of the home screen.',
  },
] as const;

export function boostPackageFor(durationDays: number): BoostPackage | null {
  return BOOST_PACKAGES.find((pkg) => pkg.durationDays === durationDays) ?? null;
}

/**
 * Price for a duration, or null if it is not one we sell.
 *
 * Returning null rather than interpolating a price is deliberate: an API that
 * quietly prices an unlisted 30-day boost is an API that can be talked into
 * selling a year of promotion for a rupee.
 */
export function boostPriceMinor(durationDays: number): number | null {
  return boostPackageFor(durationDays)?.priceMinor ?? null;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** When a boost bought now should end. */
export function boostEndsAt(durationDays: number, startsAt: Date = new Date()): Date {
  return new Date(startsAt.getTime() + durationDays * MS_PER_DAY);
}

export type BoostWindow = {
  isActive: boolean;
  startsAt: Date;
  endsAt: Date;
};

/** Live right now: switched on, started, and not yet finished. */
export function isBoostLive(boost: BoostWindow, now: Date = new Date()): boolean {
  return boost.isActive && boost.startsAt.getTime() <= now.getTime() && boost.endsAt.getTime() > now.getTime();
}

/**
 * Hours left on a live boost, rounded up.
 *
 * Hours rather than days because that is the unit a merchant thinks in when
 * deciding whether to buy another one this afternoon.
 */
export function boostHoursRemaining(endsAt: Date, now: Date = new Date()): number {
  const ms = endsAt.getTime() - now.getTime();
  if (ms <= 0) return 0;
  return Math.ceil(ms / (60 * 60 * 1000));
}
