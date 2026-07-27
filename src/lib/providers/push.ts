import 'server-only';
import webpush from 'web-push';
import { env, providerReadiness } from '@/lib/env';

/**
 * Push notification abstraction.
 *
 * In-app notifications are always written to the database (that is the source of
 * truth the bell icon reads). Push is a best-effort *delivery* channel on top —
 * a failed push must never fail the order operation that triggered it.
 */

export type PushTarget = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type PushMessage = {
  title: string;
  body: string;
  href?: string;
  tag?: string;
};

export type PushSendResult = {
  delivered: number;
  /** Endpoints the browser reported as gone — callers should delete these. */
  expiredEndpoints: string[];
};

export interface PushProvider {
  readonly name: string;
  send(targets: PushTarget[], message: PushMessage): Promise<PushSendResult>;
}

/** Used when VAPID keys are absent. Logs so local development is still observable. */
export class MockPushProvider implements PushProvider {
  readonly name = 'mock';

  async send(targets: PushTarget[], message: PushMessage): Promise<PushSendResult> {
    if (targets.length > 0) {
      console.info(`[push:mock] "${message.title}" → ${targets.length} subscription(s)`);
    }
    return { delivered: targets.length, expiredEndpoints: [] };
  }
}

export class WebPushProvider implements PushProvider {
  readonly name = 'webpush';

  constructor(subject: string, publicKey: string, privateKey: string) {
    webpush.setVapidDetails(subject, publicKey, privateKey);
  }

  async send(targets: PushTarget[], message: PushMessage): Promise<PushSendResult> {
    const payload = JSON.stringify(message);
    const expiredEndpoints: string[] = [];
    let delivered = 0;

    await Promise.all(
      targets.map(async (target) => {
        try {
          await webpush.sendNotification(
            { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
            payload,
          );
          delivered += 1;
        } catch (error) {
          const status = (error as { statusCode?: number }).statusCode;
          // 404/410 mean the subscription is dead, not that we did anything wrong.
          if (status === 404 || status === 410) expiredEndpoints.push(target.endpoint);
          else console.warn('[push] delivery failed', status ?? error);
        }
      }),
    );

    return { delivered, expiredEndpoints };
  }
}

let cached: PushProvider | null = null;

export function getPushProvider(): PushProvider {
  if (cached) return cached;
  cached = providerReadiness.push
    ? new WebPushProvider(env.VAPID_SUBJECT, env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY)
    : new MockPushProvider();
  return cached;
}
