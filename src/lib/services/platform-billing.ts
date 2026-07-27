import 'server-only';
import QRCode from 'qrcode';
import { buildUpiAppLinks, buildUpiUri, isValidUpiId } from '@/lib/domain/upi';
import { env, providerReadiness } from '@/lib/env';

/**
 * "Pay the platform" UPI links — subscriptions and boosts, Phase 1.
 *
 * The same trade-off as customer-to-shop UPI (`domain/upi`): a deep link is
 * fire-and-forget, so nothing here can confirm that money arrived. The merchant
 * pays, sends the reference, and an admin records it against their subscription.
 * Anything that claimed to auto-activate on scan would be guessing about money.
 */

export type PlatformPaymentLink = {
  configured: boolean;
  upiId: string;
  payeeName: string;
  supportPhone: string;
  amountMinor: number;
  note: string;
  uri: string | null;
  qrDataUrl: string | null;
  appLinks: { app: string; label: string; href: string }[];
};

export async function buildPlatformPaymentLink(options: {
  amountMinor: number;
  /** Short reference the admin will see, e.g. "SUB PRO" or "BOOST 3D". */
  note: string;
  reference?: string;
}): Promise<PlatformPaymentLink> {
  const upiId = env.PLATFORM_UPI_ID.trim();
  const payeeName = env.PLATFORM_UPI_NAME.trim() || 'Takeaway';

  const base = {
    configured: false,
    upiId,
    payeeName,
    supportPhone: env.PLATFORM_SUPPORT_PHONE,
    amountMinor: options.amountMinor,
    note: options.note,
    uri: null,
    qrDataUrl: null,
    appLinks: [],
  } satisfies PlatformPaymentLink;

  if (!providerReadiness.platformBilling || !isValidUpiId(upiId)) return base;

  const linkInput = {
    upiId,
    payeeName,
    amountMinor: options.amountMinor,
    note: options.note,
    reference: options.reference,
  };

  try {
    const uri = buildUpiUri(linkInput);
    return {
      ...base,
      configured: true,
      uri,
      appLinks: buildUpiAppLinks(linkInput),
      // Merchants often run the dashboard on a counter tablet with no UPI app
      // installed; the QR is what lets them pay from the phone in their pocket.
      qrDataUrl: await QRCode.toDataURL(uri, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 512,
        color: { dark: '#0f172a', light: '#ffffff' },
      }),
    };
  } catch {
    // A malformed VPA in configuration must not take the billing page down.
    return base;
  }
}
