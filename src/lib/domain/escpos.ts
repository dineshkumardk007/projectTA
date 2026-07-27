/**
 * ESC/POS command encoding for thermal kitchen slips.
 *
 * Pure and byte-oriented, with no browser API in sight, so the exact bytes sent
 * to a printer can be asserted in a unit test. The transport (Web Serial, Web
 * Bluetooth) lives in `lib/utils/thermal-printer` and only moves the buffer this
 * module produces.
 *
 * **Why raw bytes rather than `window.print()`.** A browser print dialog on a
 * counter tablet needs a driver, a paper size and two taps, and it renders a
 * page rather than a ticket. A ₹1,200 Bluetooth thermal printer speaks ESC/POS
 * and nothing else. The existing print-preview modal stays as the fallback for
 * shops without one.
 *
 * Targets the common 58 mm (32-column) and 80 mm (48-column) Chinese printers
 * that dominate this market. Everything used here is from the original Epson
 * command set that all of them implement — no vendor extensions, because a slip
 * that prints on one shop's printer and jams another's is worse than useless.
 */

export type PaperWidth = 32 | 48;

// Control bytes, named so the command sequences below can be read.
const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

export type ReceiptLine = { name: string; quantity: number; note?: string };

export type ReceiptInput = {
  shopName: string;
  orderCode: string;
  placedAt: Date;
  customerName: string;
  customerPhone?: string | null;
  paymentLabel: string;
  totalLabel: string;
  items: ReceiptLine[];
  customListText?: string | null;
  customerNote?: string | null;
  /** 32 for 58 mm paper, 48 for 80 mm. */
  columns?: PaperWidth;
};

/**
 * ESC/POS is a single-byte protocol; most of these printers are set to code page
 * 437 or 850 out of the box and none of them render Devanagari or Tamil.
 *
 * So the text is transliterated down to printable ASCII rather than sent as
 * UTF-8 and turned into garbage. `₹` becomes `Rs.` — a slip that says "Rs.80" is
 * readable by everyone at the counter; one that says "â¹80" is
 * readable by nobody.
 */
// Written as escapes rather than literal glyphs: a curly quote in source is
// indistinguishable from a straight one at a glance, and a pattern that silently
// matches nothing is exactly the bug this table exists to prevent.
const REPLACEMENTS: [RegExp, string][] = [
  [/₹/g, 'Rs.'], // ₹
  [/[—–]/g, '-'], // em dash, en dash
  [/[“”]/g, '"'], // curly double quotes
  [/[‘’]/g, "'"], // curly single quotes
  [/…/g, '...'], // ellipsis
  [/•/g, '*'], // bullet
];

export function toPrintableAscii(value: string): string {
  let output = value;
  for (const [pattern, replacement] of REPLACEMENTS) output = output.replace(pattern, replacement);
  // Anything still outside printable ASCII would print as noise; a space keeps
  // the column alignment that the rest of this module depends on.
  return output.replace(/[^\x20-\x7e]/g, ' ');
}

/** Splits text to the paper width, breaking on spaces where it can. */
export function wrap(text: string, columns: number): string[] {
  const words = toPrintableAscii(text).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if (current.length === 0) {
      current = word;
    } else if (current.length + 1 + word.length <= columns) {
      current = `${current} ${word}`;
    } else {
      lines.push(current);
      current = word;
    }

    // A single word longer than the paper (a URL, a long item name) is cut
    // rather than allowed to wrap unpredictably in the printer's own buffer.
    while (current.length > columns) {
      lines.push(current.slice(0, columns));
      current = current.slice(columns);
    }
  }

  if (current) lines.push(current);
  return lines;
}

/** `left ............ right`, padded to the paper width. */
export function padBetween(left: string, right: string, columns: number): string {
  const l = toPrintableAscii(left);
  const r = toPrintableAscii(right);
  const gap = columns - l.length - r.length;
  if (gap < 1) return `${l} ${r}`.slice(0, columns);
  return `${l}${' '.repeat(gap)}${r}`;
}

class Encoder {
  private readonly bytes: number[] = [];

  raw(...values: number[]): this {
    this.bytes.push(...values);
    return this;
  }

  text(value: string): this {
    for (const char of toPrintableAscii(value)) {
      this.bytes.push(char.charCodeAt(0) & 0xff);
    }
    return this;
  }

  line(value = ''): this {
    return this.text(value).raw(LF);
  }

  /** ESC @ — clears any state a previous job left behind. */
  reset(): this {
    return this.raw(ESC, 0x40);
  }

  /** ESC a n — 0 left, 1 centre, 2 right. */
  align(mode: 'left' | 'center' | 'right'): this {
    return this.raw(ESC, 0x61, mode === 'center' ? 1 : mode === 'right' ? 2 : 0);
  }

  /** ESC E n */
  bold(on: boolean): this {
    return this.raw(ESC, 0x45, on ? 1 : 0);
  }

  /** GS ! n — the low nibble is height, the high nibble width. */
  size(scale: 1 | 2 | 3): this {
    const n = ((scale - 1) << 4) | (scale - 1);
    return this.raw(GS, 0x21, n);
  }

  /** GS V m — full cut. Ignored by printers without a cutter, which is harmless. */
  cut(): this {
    return this.raw(GS, 0x56, 0x00);
  }

  feed(lines: number): this {
    for (let i = 0; i < lines; i += 1) this.bytes.push(LF);
    return this;
  }

  build(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}

function formatTime(date: Date): string {
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Builds the kitchen ticket.
 *
 * Laid out for someone reading it at arm's length over a hot stove: the order
 * code is double-height at the top, quantities lead each line, and the money is
 * last because the kitchen does not need it. Nothing here is decoration —
 * thermal paper costs money and a longer slip is a slower slip.
 */
export function buildKitchenTicket(input: ReceiptInput): Uint8Array {
  const columns: PaperWidth = input.columns ?? 32;
  const divider = '-'.repeat(columns);
  const encoder = new Encoder();

  encoder.reset().align('center').bold(true).size(1).line(input.shopName).bold(false);
  encoder.line('KITCHEN ORDER TICKET');

  encoder.size(2).bold(true).line(input.orderCode).bold(false).size(1);
  encoder.line(formatTime(input.placedAt));

  encoder.align('left').line(divider);
  for (const line of wrap(`Customer: ${input.customerName}`, columns)) encoder.line(line);
  if (input.customerPhone) encoder.line(`Phone: ${toPrintableAscii(input.customerPhone)}`);
  for (const line of wrap(`Payment: ${input.paymentLabel}`, columns)) encoder.line(line);
  encoder.line(divider);

  if (input.customListText) {
    encoder.bold(true).line('CUSTOM LIST').bold(false);
    for (const line of wrap(input.customListText, columns)) encoder.line(line);
  } else if (input.items.length === 0) {
    encoder.line('(no items)');
  } else {
    for (const item of input.items) {
      // Quantity first: it is the number that changes what the cook does.
      const label = `${item.quantity} x ${item.name}`;
      const wrapped = wrap(label, columns);
      encoder.bold(true).line(wrapped[0] ?? label).bold(false);
      for (const continuation of wrapped.slice(1)) encoder.line(`   ${continuation}`.slice(0, columns));
      if (item.note) {
        for (const line of wrap(item.note, columns - 3)) encoder.line(`   ${line}`);
      }
    }
  }

  if (input.customerNote) {
    encoder.line(divider).bold(true).line('NOTE').bold(false);
    for (const line of wrap(input.customerNote, columns)) encoder.line(line);
  }

  encoder.line(divider);
  encoder.bold(true).line(padBetween('TOTAL', input.totalLabel, columns)).bold(false);

  // Thermal cutters sit a few millimetres above the print head, so the paper has
  // to be advanced or the cut lands in the middle of the last line.
  encoder.feed(4).cut();

  return encoder.build();
}
