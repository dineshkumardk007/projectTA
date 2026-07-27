/**
 * Zero-cost WhatsApp alert deep-link generator.
 *
 * Opens WhatsApp Web or the native app with a pre-formatted pickup notification,
 * with no paid API tokens and no per-message fee.
 *
 * **What this is not.** It does not *send* anything. `wa.me` opens a chat with
 * the message typed in; a human still presses send. A true auto-send needs the
 * WhatsApp Business Cloud API (Meta, Twilio or Wati), a verified business, and
 * pre-approved message templates — a per-message cost and a week of approvals
 * for something a counter staffer can do with one tap today. Swapping this for
 * a real API later means replacing this one function and calling it from the
 * server on the READY transition; every call site already passes what such an
 * API would need.
 *
 * `trackingUrl` carries the customer's own order page, which is where their
 * pickup QR code lives — that is what makes the READY message useful at the
 * counter rather than just informative.
 */

export function generateWhatsAppLink({
  phone,
  customerName,
  orderCode,
  shopName,
  status,
  totalMinor,
  trackingUrl,
}: {
  phone: string;
  customerName: string;
  orderCode: string;
  shopName: string;
  status: 'ACCEPTED' | 'PREPARING' | 'READY';
  totalMinor?: number;
  /** Absolute link to the customer's order page, which shows their pickup QR. */
  trackingUrl?: string;
}): string {
  // Normalise 10-digit Indian phone number to 91XXXXXXXXXX
  const cleanPhone = phone.replace(/[^\d]/g, '');
  const formattedPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;

  let message = '';
  if (status === 'READY') {
    message = `Hi ${customerName}! 🍵 Your order *${orderCode}* at *${shopName}* is *READY FOR PICKUP*! Show your order code or QR at the counter.`;
  } else if (status === 'ACCEPTED') {
    message = `Hi ${customerName}! Your order *${orderCode}* at *${shopName}* has been *ACCEPTED* and is being packed.`;
  } else {
    message = `Hi ${customerName}! Your order *${orderCode}* at *${shopName}* is currently being prepared.`;
  }

  if (totalMinor && totalMinor > 0) {
    const rupees = (totalMinor / 100).toFixed(2);
    message += ` Total Bill: ₹${rupees}`;
  }

  // Last, on its own line: WhatsApp only turns a URL into a tappable link when
  // it is not buried mid-sentence, and this link is the point of the message.
  if (trackingUrl) {
    message += `\n\nYour pickup QR code: ${trackingUrl}`;
  }

  return `https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`;
}
