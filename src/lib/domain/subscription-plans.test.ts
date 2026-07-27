import { describe, expect, it } from 'vitest';
import {
  SUBSCRIPTION_PLANS,
  daysRemaining,
  describeHealth,
  extendPeriodEnd,
  isPeriodActive,
  monthlyRecurringRevenueMinor,
  planFor,
  priceMinorFor,
} from './subscription-plans';

const NOW = new Date('2026-07-27T10:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

function inDays(days: number): Date {
  return new Date(NOW.getTime() + days * DAY_MS);
}

describe('subscription pricing', () => {
  it('prices each tier as advertised', () => {
    expect(priceMinorFor('STARTER')).toBe(39_900);
    expect(priceMinorFor('PRO')).toBe(89_900);
    expect(priceMinorFor('ENTERPRISE')).toBe(149_900);
  });

  it('exposes a plan for every tier', () => {
    for (const plan of SUBSCRIPTION_PLANS) {
      expect(planFor(plan.tier).tier).toBe(plan.tier);
      expect(planFor(plan.tier).features.length).toBeGreaterThan(0);
    }
  });
});

describe('isPeriodActive', () => {
  it('requires an entitled status and an unexpired period together', () => {
    expect(isPeriodActive({ tier: 'STARTER', status: 'ACTIVE', currentPeriodEnd: inDays(5) }, NOW)).toBe(true);
    expect(isPeriodActive({ tier: 'STARTER', status: 'TRIALING', currentPeriodEnd: inDays(1) }, NOW)).toBe(true);
  });

  it('rejects an entitled status whose period has run out', () => {
    expect(isPeriodActive({ tier: 'PRO', status: 'ACTIVE', currentPeriodEnd: inDays(-1) }, NOW)).toBe(false);
  });

  it('rejects a non-entitled status even inside a paid period', () => {
    // The distinction that matters for suspension: the merchant has time left on
    // the clock, but the status says they must not be listed.
    expect(isPeriodActive({ tier: 'PRO', status: 'PAST_DUE', currentPeriodEnd: inDays(10) }, NOW)).toBe(false);
    expect(isPeriodActive({ tier: 'PRO', status: 'EXPIRED', currentPeriodEnd: inDays(10) }, NOW)).toBe(false);
  });

  it('treats the exact expiry instant as expired', () => {
    expect(isPeriodActive({ tier: 'STARTER', status: 'ACTIVE', currentPeriodEnd: NOW }, NOW)).toBe(false);
  });
});

describe('daysRemaining', () => {
  it('rounds part-days up so a live shop never reads "0 days left"', () => {
    expect(daysRemaining(new Date(NOW.getTime() + 6 * 60 * 60 * 1000), NOW)).toBe(1);
    expect(daysRemaining(inDays(1), NOW)).toBe(1);
    expect(daysRemaining(inDays(29.5), NOW)).toBe(30);
  });

  it('floors at zero once the period has passed', () => {
    expect(daysRemaining(inDays(-3), NOW)).toBe(0);
    expect(daysRemaining(NOW, NOW)).toBe(0);
  });
});

describe('extendPeriodEnd', () => {
  it('adds days on top of an unexpired period, so paying early loses nothing', () => {
    const extended = extendPeriodEnd(inDays(10), 30, NOW);
    expect(extended.getTime()).toBe(inDays(40).getTime());
  });

  it('restarts from now when the period has already lapsed', () => {
    const extended = extendPeriodEnd(inDays(-5), 30, NOW);
    expect(extended.getTime()).toBe(inDays(30).getTime());
  });

  it('starts from now for a merchant with no subscription yet', () => {
    expect(extendPeriodEnd(null, 30, NOW).getTime()).toBe(inDays(30).getTime());
  });
});

describe('monthlyRecurringRevenueMinor', () => {
  it('sums the list price of every subscription passed in', () => {
    const mrr = monthlyRecurringRevenueMinor([
      { tier: 'STARTER' },
      { tier: 'STARTER' },
      { tier: 'PRO' },
      { tier: 'ENTERPRISE' },
    ]);
    expect(mrr).toBe(39_900 * 2 + 89_900 + 149_900);
  });

  it('is zero with nothing active', () => {
    expect(monthlyRecurringRevenueMinor([])).toBe(0);
  });
});

describe('describeHealth', () => {
  it('flags the last five days as expiring so renewals can be chased', () => {
    expect(describeHealth({ tier: 'PRO', status: 'ACTIVE', currentPeriodEnd: inDays(4) }, NOW)).toBe('expiring');
    expect(describeHealth({ tier: 'PRO', status: 'ACTIVE', currentPeriodEnd: inDays(20) }, NOW)).toBe('active');
  });

  it('reports a lapsed period as expired whatever the stored status says', () => {
    expect(describeHealth({ tier: 'PRO', status: 'ACTIVE', currentPeriodEnd: inDays(-1) }, NOW)).toBe('expired');
  });

  it('keeps cancelled distinct from expired', () => {
    // A merchant who cancelled but still has paid time left is not the same as
    // one who stopped paying, and the console must not conflate them.
    expect(describeHealth({ tier: 'PRO', status: 'CANCELLED', currentPeriodEnd: inDays(10) }, NOW)).toBe(
      'cancelled',
    );
  });

  it('labels a running trial as a trial', () => {
    expect(describeHealth({ tier: 'STARTER', status: 'TRIALING', currentPeriodEnd: inDays(12) }, NOW)).toBe(
      'trialing',
    );
  });
});
