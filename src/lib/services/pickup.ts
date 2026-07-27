import 'server-only';
import crypto from 'node:crypto';
import QRCode from 'qrcode';
import { env } from '@/lib/env';

/**
 * Pickup verification.
 *
 * The QR encodes a signed token, not the raw order id. That matters because a
 * QR code gets photographed, forwarded and shoulder-surfed: a token that is
 * signed with the server secret and bound to the order's own pickup code cannot
 * be forged from an order id someone happened to see, and it proves the bearer
 * saw the customer's screen.
 *
 * QR is never the only route — `verifyPickupToken` and a plain order-code lookup
 * both end at the same server-side check, so a dead phone battery does not
 * strand a customer.
 */

const TOKEN_VERSION = 'v1';

export function buildPickupToken(orderId: string, pickupCode: string): string {
  const payload = `${TOKEN_VERSION}.${orderId}.${pickupCode}`;
  const signature = crypto
    .createHmac('sha256', env.AUTH_SECRET)
    .update(payload)
    .digest('base64url')
    .slice(0, 32);
  return `${payload}.${signature}`;
}

export type ParsedPickupToken = { orderId: string; pickupCode: string };

/** Returns null for anything malformed, unsigned or tampered with. */
export function parsePickupToken(token: string): ParsedPickupToken | null {
  const parts = token.trim().split('.');
  if (parts.length !== 4) return null;

  const [version, orderId, pickupCode, signature] = parts;
  if (version !== TOKEN_VERSION) return null;

  const expected = crypto
    .createHmac('sha256', env.AUTH_SECRET)
    .update(`${version}.${orderId}.${pickupCode}`)
    .digest('base64url')
    .slice(0, 32);

  const provided = Buffer.from(signature);
  const computed = Buffer.from(expected);
  if (provided.length !== computed.length || !crypto.timingSafeEqual(provided, computed)) return null;

  return { orderId, pickupCode };
}

/** Renders the token as a scannable PNG data URL. */
export async function renderPickupQr(token: string): Promise<string> {
  return QRCode.toDataURL(token, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 512,
    color: { dark: '#0f172a', light: '#ffffff' },
  });
}

/**
 * The permanent poster QR for a shop — deep links straight to its menu.
 *
 * Encodes `/s/<publicQrToken>`, not the shop's slug. Two reasons: the token
 * survives a rename (a printed poster cannot be reissued), and the redirect
 * behind it is what credits the order to the poster instead of to app search.
 */
export async function renderShopQr(publicQrToken: string): Promise<{ url: string; dataUrl: string }> {
  const url = `${env.NEXT_PUBLIC_APP_URL}/s/${publicQrToken}`;
  const dataUrl = await QRCode.toDataURL(url, {
    errorCorrectionLevel: 'H',
    margin: 1,
    width: 768,
    color: { dark: '#0f172a', light: '#ffffff' },
  });
  return { url, dataUrl };
}
