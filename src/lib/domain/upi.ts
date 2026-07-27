/**
 * UPI deep links — direct shop-to-customer payment, no gateway.
 *
 * The customer's money moves straight from their UPI app into the shop's own
 * bank account. The platform never touches it, which is the whole point: no
 * commission, no settlement account, no payment-aggregator licence, nothing to
 * set up beyond the shop typing in its UPI ID.
 *
 * **The trade-off, stated plainly:** a `upi://` link is fire-and-forget. There
 * is no callback, no webhook and no server-to-server confirmation — the payer's
 * app talks to NPCI, not to us. So this module can build a link and nothing
 * more. Whether money actually arrived is established by the customer entering
 * their UPI reference and the shop confirming it against their own app, which
 * is what `services/upi.ts` implements. Anything that claims otherwise would be
 * lying to the merchant about money.
 *
 * Pure and dependency-free so it can run on the client too.
 */

/** `something@bank`. Deliberately permissive — banks keep inventing handles. */
const VPA_PATTERN = /^[a-zA-Z0-9](?:[a-zA-Z0-9.\-_]{0,254}[a-zA-Z0-9])?@[a-zA-Z][a-zA-Z0-9.\-_]{1,63}$/;

export function isValidUpiId(value: string): boolean {
  return VPA_PATTERN.test(value.trim());
}

/**
 * UPI apps are fussy about the note field: several silently drop a payment whose
 * `tn` contains punctuation. Reduced to letters, digits and spaces.
 */
function sanitiseNote(note: string, maxLength = 50): string {
  return note
    .replace(/[^a-zA-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

/** Reference ids must be alphanumeric; anything else gets stripped. */
function sanitiseReference(reference: string, maxLength = 35): string {
  return reference.replace(/[^a-zA-Z0-9]/g, '').slice(0, maxLength);
}

export type UpiLinkInput = {
  /** Payee VPA — the shop's UPI ID. */
  upiId: string;
  /** Payee name as it should appear in the payer's app. */
  payeeName: string;
  /** Amount in paise. Omit for an open-amount link. */
  amountMinor?: number;
  /** Short note, e.g. the order code. */
  note?: string;
  /** Merchant-side reference, used when reconciling against a bank statement. */
  reference?: string;
};

/**
 * Builds the canonical `upi://pay?…` string.
 *
 * `encodeURIComponent` is applied to every value — a payee name with a space
 * must arrive as `%20` or the app will truncate it at the space.
 */
export function buildUpiUri(input: UpiLinkInput): string {
  const upiId = input.upiId.trim();
  if (!isValidUpiId(upiId)) {
    throw new Error(`"${upiId}" is not a valid UPI ID.`);
  }

  const params: [string, string][] = [
    ['pa', upiId],
    ['pn', input.payeeName.trim().slice(0, 99)],
    ['cu', 'INR'],
  ];

  if (input.amountMinor != null) {
    if (!Number.isFinite(input.amountMinor) || input.amountMinor <= 0) {
      throw new Error('UPI amount must be a positive number of paise.');
    }
    // Always two decimals: apps treat "80" and "80.00" the same, but some
    // reject "80.5" style single-decimal values.
    params.push(['am', (input.amountMinor / 100).toFixed(2)]);
  }

  const note = input.note ? sanitiseNote(input.note) : '';
  if (note) params.push(['tn', note]);

  const reference = input.reference ? sanitiseReference(input.reference) : '';
  if (reference) params.push(['tr', reference]);

  const query = params.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&');
  return `upi://pay?${query}`;
}

/**
 * The same payment addressed to specific apps.
 *
 * Android resolves the generic `upi://` scheme to an app chooser, but iOS
 * frequently does not — there, only an app's own scheme opens reliably. Offering
 * named buttons also just reads better than one "Pay by UPI" button that may
 * open nothing.
 */
export type UpiAppLink = { app: string; label: string; href: string };

export function buildUpiAppLinks(input: UpiLinkInput): UpiAppLink[] {
  const query = buildUpiUri(input).slice('upi://pay?'.length);

  return [
    { app: 'any', label: 'Any UPI app', href: `upi://pay?${query}` },
    { app: 'gpay', label: 'Google Pay', href: `tez://upi/pay?${query}` },
    { app: 'phonepe', label: 'PhonePe', href: `phonepe://pay?${query}` },
    { app: 'paytm', label: 'Paytm', href: `paytmmp://pay?${query}` },
  ];
}

/**
 * How much to collect up front.
 *
 * A deposit exists to make a no-show cost the customer something without asking
 * them to prepay a whole order to a shop they may not know. Rounded to whole
 * rupees, because a UPI note asking for ₹23.47 looks like a mistake.
 */
export function depositForTotal(totalMinor: number, percent: number): number {
  const clampedPercent = Math.min(100, Math.max(1, Math.round(percent)));
  const raw = (totalMinor * clampedPercent) / 100;
  const rounded = Math.round(raw / 100) * 100;

  // Never zero (there would be nothing to pay) and never more than the total.
  return Math.min(totalMinor, Math.max(100, rounded));
}

/**
 * UPI reference numbers (UTR/RRN) are 12 digits, though apps label them
 * inconsistently — "UPI transaction ID", "UTR", "Reference no". Some banks
 * return 16 or 22 characters, so length is checked loosely and only the
 * obviously-wrong is rejected.
 */
export function isPlausibleUpiReference(value: string): boolean {
  const cleaned = value.replace(/\s/g, '');
  return /^[a-zA-Z0-9]{8,35}$/.test(cleaned);
}

export function normaliseUpiReference(value: string): string {
  return value.replace(/\s/g, '').toUpperCase();
}
