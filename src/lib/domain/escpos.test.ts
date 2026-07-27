import { describe, expect, it } from 'vitest';
import { buildKitchenTicket, padBetween, toPrintableAscii, wrap } from './escpos';

/** The bytes are the contract with the printer, so they are asserted directly. */
function decode(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => String.fromCharCode(byte))
    .join('');
}

describe('toPrintableAscii', () => {
  it('turns the rupee sign into something a code-page-437 printer can render', () => {
    // "Rs.80" is readable at a counter; the raw byte for ₹ is not.
    expect(toPrintableAscii('₹80')).toBe('Rs.80');
  });

  it('replaces typographic punctuation with ASCII equivalents', () => {
    expect(toPrintableAscii('a — b')).toBe('a - b');
    expect(toPrintableAscii('“quoted”')).toBe('"quoted"');
    expect(toPrintableAscii('wait…')).toBe('wait...');
  });

  it('blanks anything else outside printable ASCII rather than emitting noise', () => {
    expect(toPrintableAscii('தேநீர்')).toBe('      ');
    expect(toPrintableAscii('tea 🍵')).toBe('tea   ');
  });
});

describe('wrap', () => {
  it('breaks on spaces within the paper width', () => {
    expect(wrap('one two three four', 9)).toEqual(['one two', 'three', 'four']);
  });

  it('hard-cuts a word longer than the paper', () => {
    expect(wrap('aaaaaaaaaaaa', 5)).toEqual(['aaaaa', 'aaaaa', 'aa']);
  });

  it('returns nothing for empty text', () => {
    expect(wrap('   ', 32)).toEqual([]);
  });

  it('never emits a line wider than the paper', () => {
    const lines = wrap('Masala dosa with extra podi and coconut chutney on the side', 32);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(32);
  });
});

describe('padBetween', () => {
  it('pads a label and value out to the full paper width', () => {
    expect(padBetween('TOTAL', 'Rs.80', 16)).toBe('TOTAL      Rs.80');
    expect(padBetween('TOTAL', 'Rs.80', 16)).toHaveLength(16);
  });

  it('truncates rather than overflowing when the two do not fit', () => {
    expect(padBetween('AVERYLONGLABEL', 'Rs.1000', 10)).toHaveLength(10);
  });
});

const BASE = {
  shopName: 'Anand Tea Stall',
  orderCode: 'A102',
  placedAt: new Date('2026-07-27T10:00:00.000Z'),
  customerName: 'Priya',
  customerPhone: '9876543210',
  paymentLabel: 'Cash at counter',
  totalLabel: '₹80',
  items: [
    { name: 'Masala tea', quantity: 2, note: 'Less sugar' },
    { name: 'Vada', quantity: 1 },
  ],
};

describe('buildKitchenTicket', () => {
  it('opens with a printer reset so a previous job cannot bleed into this one', () => {
    const bytes = buildKitchenTicket(BASE);
    expect(bytes[0]).toBe(0x1b);
    expect(bytes[1]).toBe(0x40);
  });

  it('ends by feeding paper past the cutter and then cutting', () => {
    const bytes = buildKitchenTicket(BASE);
    const tail = Array.from(bytes.slice(-7));
    // Four line feeds clear the gap between print head and blade, then GS V 0.
    expect(tail).toEqual([0x0a, 0x0a, 0x0a, 0x0a, 0x1d, 0x56, 0x00]);
  });

  it('includes the order code, customer and every item', () => {
    const text = decode(buildKitchenTicket(BASE));
    expect(text).toContain('A102');
    expect(text).toContain('Anand Tea Stall');
    expect(text).toContain('Customer: Priya');
    expect(text).toContain('Phone: 9876543210');
    expect(text).toContain('2 x Masala tea');
    expect(text).toContain('1 x Vada');
    expect(text).toContain('Less sugar');
  });

  it('converts the total into printer-safe characters', () => {
    const text = decode(buildKitchenTicket(BASE));
    expect(text).toContain('Rs.80');
    expect(text).not.toContain('₹');
  });

  it('prints a custom list instead of items when there is one', () => {
    const text = decode(
      buildKitchenTicket({ ...BASE, items: [], customListText: '2 kg onions, 1 kg tomatoes' }),
    );
    expect(text).toContain('CUSTOM LIST');
    expect(text).toContain('onions');
  });

  it('says so rather than printing a blank ticket when there is nothing to make', () => {
    const text = decode(buildKitchenTicket({ ...BASE, items: [] }));
    expect(text).toContain('(no items)');
  });

  it('includes the customer note, which is the thing most often missed', () => {
    const text = decode(buildKitchenTicket({ ...BASE, customerNote: 'No coriander please' }));
    expect(text).toContain('NOTE');
    expect(text).toContain('No coriander');
  });

  it('emits only single bytes, as an 8-bit protocol requires', () => {
    for (const byte of buildKitchenTicket({ ...BASE, customerName: 'Priya ☕', shopName: 'Café' })) {
      expect(byte).toBeLessThanOrEqual(0xff);
    }
  });

  it('respects 80 mm paper when asked for it', () => {
    const narrow = decode(buildKitchenTicket({ ...BASE, columns: 32 }));
    const wide = decode(buildKitchenTicket({ ...BASE, columns: 48 }));
    expect(narrow).toContain('-'.repeat(32));
    expect(wide).toContain('-'.repeat(48));
  });
});
