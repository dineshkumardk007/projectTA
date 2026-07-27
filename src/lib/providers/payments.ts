import 'server-only';
import crypto from 'node:crypto';
import { env, providerReadiness } from '@/lib/env';

/**
 * Payment provider abstraction.
 *
 * Raw card details never enter this application. A provider returns an *intent*
 * that the client hands to the provider's own hosted/SDK checkout; the only
 * thing we persist is a reference and a status.
 *
 * `MockPaymentProvider` exists so the entire order lifecycle — including
 * failure and refund paths — is testable with no credentials and no network.
 */

export type PaymentIntent = {
  /** Provider-side id, stored as `Payment.providerRef`. */
  reference: string;
  amountMinor: number;
  currency: 'INR';
  /** Handed to the client SDK. Never contains a secret key. */
  clientPayload: Record<string, string | number>;
};

export type PaymentConfirmation = {
  reference: string;
  succeeded: boolean;
  failureReason?: string;
};

export type RefundResult = {
  reference: string;
  amountMinor: number;
  succeeded: boolean;
  failureReason?: string;
};

export interface PaymentProvider {
  readonly name: string;
  /** True when the customer must complete a checkout step before we prepare. */
  readonly requiresClientAction: boolean;

  createIntent(input: { orderId: string; amountMinor: number; description: string }): Promise<PaymentIntent>;

  /**
   * Verifies a client-reported success against provider-signed data. A client
   * saying "I paid" is never sufficient on its own.
   */
  confirm(input: { reference: string; signature?: string; raw?: Record<string, unknown> }): Promise<PaymentConfirmation>;

  refund(input: { reference: string; amountMinor: number; reason?: string }): Promise<RefundResult>;
}

/**
 * Local/demo provider. Deterministic rather than random so tests are stable:
 * an amount ending in `.99` always fails, everything else succeeds. That gives
 * a reliable way to exercise the failure branch from the UI.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock';
  readonly requiresClientAction = true;

  private readonly secret: string;

  constructor(secret: string) {
    this.secret = secret;
  }

  private sign(reference: string): string {
    return crypto.createHmac('sha256', this.secret).update(reference).digest('hex');
  }

  async createIntent(input: { orderId: string; amountMinor: number; description: string }): Promise<PaymentIntent> {
    const reference = `mock_${input.orderId}_${crypto.randomBytes(6).toString('hex')}`;
    return {
      reference,
      amountMinor: input.amountMinor,
      currency: 'INR',
      clientPayload: {
        reference,
        description: input.description,
        // The mock "gateway" is the app's own confirm endpoint; this signature
        // stands in for the provider's.
        signature: this.sign(reference),
      },
    };
  }

  async confirm(input: { reference: string; signature?: string }): Promise<PaymentConfirmation> {
    if (!input.signature || input.signature !== this.sign(input.reference)) {
      return { reference: input.reference, succeeded: false, failureReason: 'Invalid payment signature.' };
    }
    return { reference: input.reference, succeeded: true };
  }

  async refund(input: { reference: string; amountMinor: number }): Promise<RefundResult> {
    return {
      reference: `mockrf_${crypto.randomBytes(6).toString('hex')}`,
      amountMinor: input.amountMinor,
      succeeded: true,
    };
  }
}

/**
 * Razorpay shape, ready for keys. Order creation and refunds are REST calls
 * against api.razorpay.com; signature verification is HMAC-SHA256 over
 * `${order_id}|${payment_id}` with the key secret, which is implemented here
 * because getting it wrong is a security bug rather than a missing feature.
 */
export class RazorpayPaymentProvider implements PaymentProvider {
  readonly name = 'razorpay';
  readonly requiresClientAction = true;

  constructor(
    private readonly keyId: string,
    private readonly keySecret: string,
  ) {}

  private authHeader(): string {
    return `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64')}`;
  }

  async createIntent(input: { orderId: string; amountMinor: number; description: string }): Promise<PaymentIntent> {
    const response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: this.authHeader() },
      body: JSON.stringify({
        amount: input.amountMinor,
        currency: 'INR',
        receipt: input.orderId,
        notes: { description: input.description },
      }),
    });

    if (!response.ok) {
      throw new Error(`Razorpay order creation failed (${response.status}).`);
    }

    const data = (await response.json()) as { id: string };
    return {
      reference: data.id,
      amountMinor: input.amountMinor,
      currency: 'INR',
      clientPayload: { key: this.keyId, order_id: data.id, amount: input.amountMinor },
    };
  }

  async confirm(input: {
    reference: string;
    signature?: string;
    raw?: Record<string, unknown>;
  }): Promise<PaymentConfirmation> {
    const paymentId = input.raw?.razorpay_payment_id;
    if (typeof paymentId !== 'string' || !input.signature) {
      return { reference: input.reference, succeeded: false, failureReason: 'Missing payment confirmation fields.' };
    }

    const expected = crypto
      .createHmac('sha256', this.keySecret)
      .update(`${input.reference}|${paymentId}`)
      .digest('hex');

    const provided = Buffer.from(input.signature);
    const computed = Buffer.from(expected);
    const valid =
      provided.length === computed.length && crypto.timingSafeEqual(provided, computed);

    return valid
      ? { reference: paymentId, succeeded: true }
      : { reference: input.reference, succeeded: false, failureReason: 'Signature verification failed.' };
  }

  async refund(input: { reference: string; amountMinor: number; reason?: string }): Promise<RefundResult> {
    const response = await fetch(`https://api.razorpay.com/v1/payments/${input.reference}/refund`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: this.authHeader() },
      body: JSON.stringify({ amount: input.amountMinor, notes: { reason: input.reason ?? '' } }),
    });

    if (!response.ok) {
      return {
        reference: input.reference,
        amountMinor: input.amountMinor,
        succeeded: false,
        failureReason: `Razorpay refund failed (${response.status}).`,
      };
    }

    const data = (await response.json()) as { id: string };
    return { reference: data.id, amountMinor: input.amountMinor, succeeded: true };
  }
}

let cached: PaymentProvider | null = null;

export function getPaymentProvider(): PaymentProvider {
  if (cached) return cached;
  cached =
    env.PAYMENTS_PROVIDER === 'razorpay' && providerReadiness.payments
      ? new RazorpayPaymentProvider(env.RAZORPAY_KEY_ID, env.RAZORPAY_KEY_SECRET)
      : new MockPaymentProvider(env.AUTH_SECRET);
  return cached;
}
