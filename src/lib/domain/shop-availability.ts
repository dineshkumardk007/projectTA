import type { ShopStatus } from '@prisma/client';

/**
 * Whether a shop can take an order *right now*, and why not if it cannot.
 *
 * Two independent things decide this and they are often confused:
 *   1. Operating hours — the schedule the merchant set once.
 *   2. Live status — the button the merchant taps during a rush.
 *
 * A shop is orderable only when both agree. Keeping the reason on the result
 * lets the UI say "Opens at 6:00 AM" instead of a bare "Closed".
 */

export type OperatingWindow = {
  dayOfWeek: number;
  /** Minutes past midnight. */
  opensAt: number;
  closesAt: number;
  isClosed: boolean;
};

export type Orderability = {
  canOrder: boolean;
  /** What to show on the shop card / shop page. */
  label: string;
  tone: 'success' | 'warning' | 'danger' | 'neutral';
  reason?: string;
};

export function minutesIntoDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

export function formatMinutesOfDay(minutes: number): string {
  const h24 = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const suffix = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function findTodaysWindow(hours: OperatingWindow[], now: Date): OperatingWindow | undefined {
  return hours.find((h) => h.dayOfWeek === now.getDay());
}

export function isWithinOperatingHours(hours: OperatingWindow[], now: Date): boolean {
  const today = findTodaysWindow(hours, now);
  // No schedule configured means the merchant's live status is the only gate.
  if (!today) return true;
  if (today.isClosed) return false;

  const nowMinutes = minutesIntoDay(now);
  // A window that ends before it starts crosses midnight (e.g. 18:00 → 01:00).
  if (today.closesAt <= today.opensAt) {
    return nowMinutes >= today.opensAt || nowMinutes < today.closesAt;
  }
  return nowMinutes >= today.opensAt && nowMinutes < today.closesAt;
}

export function getOrderability(input: {
  status: ShopStatus;
  isActive: boolean;
  isVerified: boolean;
  hours: OperatingWindow[];
  now?: Date;
  /** Set when the shop has hit its own concurrent-order cap. */
  atCapacity?: boolean;
}): Orderability {
  const now = input.now ?? new Date();

  if (!input.isActive || !input.isVerified) {
    return { canOrder: false, label: 'Unavailable', tone: 'neutral', reason: 'This shop is not accepting orders yet.' };
  }

  if (input.status === 'PAUSED') {
    return {
      canOrder: false,
      label: 'Paused',
      tone: 'neutral',
      reason: 'The shop has paused new orders for a short while.',
    };
  }

  if (input.status === 'CLOSED' || !isWithinOperatingHours(input.hours, now)) {
    const today = findTodaysWindow(input.hours, now);
    const reason =
      today && !today.isClosed && minutesIntoDay(now) < today.opensAt
        ? `Opens at ${formatMinutesOfDay(today.opensAt)}.`
        : 'The shop is closed right now.';
    return { canOrder: false, label: 'Closed', tone: 'neutral', reason };
  }

  if (input.atCapacity) {
    return {
      canOrder: false,
      label: 'Full',
      tone: 'danger',
      reason: 'This shop has as many orders as it can handle right now. Try again in a few minutes.',
    };
  }

  if (input.status === 'VERY_BUSY') return { canOrder: true, label: 'Very busy', tone: 'danger' };
  if (input.status === 'BUSY') return { canOrder: true, label: 'Busy', tone: 'warning' };
  return { canOrder: true, label: 'Open', tone: 'success' };
}
