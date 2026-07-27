import { describe, expect, it } from 'vitest';
import {
  BOOST_PACKAGES,
  boostEndsAt,
  boostHoursRemaining,
  boostPackageFor,
  boostPriceMinor,
  isBoostLive,
} from './boost-plans';

const NOW = new Date('2026-07-27T10:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

function inDays(days: number): Date {
  return new Date(NOW.getTime() + days * DAY_MS);
}

describe('boost pricing', () => {
  it('prices the three packages as advertised', () => {
    expect(boostPriceMinor(1)).toBe(9_900);
    expect(boostPriceMinor(3)).toBe(24_900);
    expect(boostPriceMinor(7)).toBe(49_900);
  });

  it('refuses to price a duration that is not for sale', () => {
    // The guard that stops an API being talked into a month of promotion for a
    // rupee: unknown durations get no price at all rather than an interpolated one.
    expect(boostPriceMinor(30)).toBeNull();
    expect(boostPriceMinor(0)).toBeNull();
    expect(boostPriceMinor(-1)).toBeNull();
    expect(boostPriceMinor(2)).toBeNull();
    expect(boostPackageFor(365)).toBeNull();
  });

  it('gets cheaper per day as the package gets longer', () => {
    const perDay = BOOST_PACKAGES.map((pkg) => pkg.priceMinor / pkg.durationDays);
    expect(perDay[1]).toBeLessThan(perDay[0]);
    expect(perDay[2]).toBeLessThan(perDay[1]);
  });
});

describe('boostEndsAt', () => {
  it('ends a boost exactly the bought number of days later', () => {
    expect(boostEndsAt(1, NOW).getTime()).toBe(inDays(1).getTime());
    expect(boostEndsAt(7, NOW).getTime()).toBe(inDays(7).getTime());
  });
});

describe('isBoostLive', () => {
  it('is live inside its window when switched on', () => {
    expect(isBoostLive({ isActive: true, startsAt: inDays(-1), endsAt: inDays(1) }, NOW)).toBe(true);
  });

  it('is not live once it has finished', () => {
    expect(isBoostLive({ isActive: true, startsAt: inDays(-8), endsAt: inDays(-1) }, NOW)).toBe(false);
  });

  it('is not live before it starts', () => {
    expect(isBoostLive({ isActive: true, startsAt: inDays(1), endsAt: inDays(2) }, NOW)).toBe(false);
  });

  it('respects the kill switch even mid-window', () => {
    expect(isBoostLive({ isActive: false, startsAt: inDays(-1), endsAt: inDays(1) }, NOW)).toBe(false);
  });

  it('treats the exact end instant as finished', () => {
    expect(isBoostLive({ isActive: true, startsAt: inDays(-1), endsAt: NOW }, NOW)).toBe(false);
  });
});

describe('boostHoursRemaining', () => {
  it('rounds up to the hour a merchant is deciding in', () => {
    expect(boostHoursRemaining(new Date(NOW.getTime() + 90 * 60 * 1000), NOW)).toBe(2);
    expect(boostHoursRemaining(inDays(1), NOW)).toBe(24);
  });

  it('floors at zero once finished', () => {
    expect(boostHoursRemaining(inDays(-1), NOW)).toBe(0);
  });
});
