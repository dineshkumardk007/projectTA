import { describe, expect, it } from 'vitest';
import { formatMinor, rupees } from './money';

describe('money domain utility', () => {
  it('formats minor units without paise correctly', () => {
    expect(formatMinor(8000)).toBe('₹80');
    expect(formatMinor(15000)).toBe('₹150');
  });

  it('formats minor units with paise correctly', () => {
    expect(formatMinor(8050)).toBe('₹80.50');
    expect(formatMinor(8025)).toBe('₹80.25');
  });

  it('converts rupee floats to integer minor units', () => {
    expect(rupees(80)).toBe(8000);
    expect(rupees(80.5)).toBe(8050);
    expect(rupees(99.99)).toBe(9999);
  });
});
