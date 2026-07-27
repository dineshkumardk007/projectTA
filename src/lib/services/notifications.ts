import 'server-only';
import type { NotificationType } from '@prisma/client';
import { db } from '@/lib/db';
import { getPushProvider } from '@/lib/providers/push';

/**
 * Notification delivery.
 *
 * The database row is the source of truth (that is what the bell icon reads);
 * web push is a best-effort extra channel. Push failures are swallowed on
 * purpose — a dead subscription must never roll back the order transition that
 * triggered the notification.
 */

export type NotifyInput = {
  userId: string;
  orderId?: string;
  type: NotificationType;
  title: string;
  body: string;
  href?: string;
};

export async function notify(input: NotifyInput): Promise<void> {
  try {
    await db.notification.create({
      data: {
        userId: input.userId,
        orderId: input.orderId,
        type: input.type,
        title: input.title,
        body: input.body,
        href: input.href,
      },
    });
  } catch (error) {
    console.error('[notifications] failed to record notification', error);
    return;
  }

  try {
    const subscriptions = await db.pushSubscription.findMany({ where: { userId: input.userId } });
    if (subscriptions.length === 0) return;

    const provider = getPushProvider();
    const result = await provider.send(
      subscriptions.map((s) => ({ endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth })),
      { title: input.title, body: input.body, href: input.href, tag: input.orderId },
    );

    if (result.expiredEndpoints.length > 0) {
      await db.pushSubscription.deleteMany({ where: { endpoint: { in: result.expiredEndpoints } } });
    }
  } catch (error) {
    console.warn('[notifications] push delivery failed', error);
  }
}

/** Notifies everyone who works a shop — owner and assigned staff. */
export async function notifyShopTeam(shopId: string, input: Omit<NotifyInput, 'userId'>): Promise<void> {
  const shop = await db.shop.findUnique({
    where: { id: shopId },
    select: { merchant: { select: { userId: true } }, staff: { select: { userId: true } } },
  });
  if (!shop) return;

  const userIds = new Set<string>([shop.merchant.userId, ...shop.staff.map((s) => s.userId)]);
  await Promise.all([...userIds].map((userId) => notify({ ...input, userId })));
}
