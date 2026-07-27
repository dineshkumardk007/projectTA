/**
 * Zero-cost WhatsApp alert deep-link generator.
 *
 * Opens WhatsApp Web or Native App with a pre-formatted pickup notification
 * without requiring paid API tokens or subscription fees.
 */

export function generateWhatsAppLink({
  phone,
  customerName,
  orderCode,
  shopName,
  status,
  totalMinor,
}: {
  phone: string;
  customerName: string;
  orderCode: string;
  shopName: string;
  status: 'ACCEPTED' | 'PREPARING' | 'READY';
  totalMinor?: number;
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

  return `https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`;
}
