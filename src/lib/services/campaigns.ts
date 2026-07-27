import 'server-only';
import { db } from '@/lib/db';
import { DomainError } from '@/lib/api';
import { getPushProvider } from '@/lib/providers/push';
import { haversineKm } from '@/lib/providers/maps';

/**
 * Location- and time-targeted push campaigns.
 *
 * The intended use is small and specific: at 4:30 PM, tell people within two
 * kilometres of a cluster of tea shops that the snack rush is starting. Sent by
 * an admin, one at a time, to an audience they can see the size of before they
 * press the button.
 *
 * **This is not a broadcast tool, and the constraints below are load-bearing.**
 *
 *  • Only users with a live push subscription are reachable, and a subscription
 *    exists only because someone granted permission in the browser. There is no
 *    path here that reaches somebody who did not opt in.
 *  • Location targeting uses `CustomerProfile.defaultLatitude/Longitude` — the
 *    home area a customer saved themselves — never a live position and never
 *    anything derived from their orders.
 *  • `MAX_RECIPIENTS` is a deliberate ceiling. A tool that can reach the entire
 *    user base in one tap will eventually do so by accident.
 *  • Nothing is scheduled. Campaigns fire when an admin sends them, so there is
 *    no background job that can wake up at 4:30 AM and send yesterday's message.
 */

const MAX_RECIPIENTS = 2000;
const NEARBY_DEFAULT_KM = 3;

export type CampaignTarget = {
  /** Match against the customer's saved city. */
  city?: string;
  /** Match within `radiusKm` of this point. */
  latitude?: number;
  longitude?: number;
  radiusKm?: number;
  /** Only customers who have ordered at least once. */
  orderedBefore?: boolean;
};

export type CampaignDraft = {
  title: string;
  body: string;
  href?: string;
  target: CampaignTarget;
};

type Candidate = {
  userId: string;
  latitude: number | null;
  longitude: number | null;
};

/**
 * Everyone who could receive this campaign.
 *
 * Split out from `sendCampaign` so the admin console can show a real audience
 * count *before* anything is sent. Estimating it afterwards would be too late to
 * be useful.
 */
export async function previewAudience(target: CampaignTarget): Promise<{
  userIds: string[];
  total: number;
  truncated: boolean;
  withPush: number;
}> {
  const profiles = await db.customerProfile.findMany({
    where: {
      ...(target.city ? { defaultCity: { equals: target.city, mode: 'insensitive' } } : {}),
      ...(target.orderedBefore ? { ordersPlaced: { gt: 0 } } : {}),
      // A geo campaign is meaningless for someone with no saved location, so
      // they are excluded rather than swept in as a default.
      ...(target.latitude != null && target.longitude != null
        ? { defaultLatitude: { not: null }, defaultLongitude: { not: null } }
        : {}),
      user: { isActive: true, role: 'CUSTOMER' },
    },
    select: { userId: true, defaultLatitude: true, defaultLongitude: true },
    take: 20_000,
  });

  let candidates: Candidate[] = profiles.map((profile) => ({
    userId: profile.userId,
    latitude: profile.defaultLatitude,
    longitude: profile.defaultLongitude,
  }));

  if (target.latitude != null && target.longitude != null) {
    const radiusKm = target.radiusKm ?? NEARBY_DEFAULT_KM;
    const center = { latitude: target.latitude, longitude: target.longitude };
    candidates = candidates.filter(
      (candidate) =>
        candidate.latitude != null &&
        candidate.longitude != null &&
        haversineKm(center, { latitude: candidate.latitude, longitude: candidate.longitude }) <= radiusKm,
    );
  }

  const total = candidates.length;
  const userIds = candidates.slice(0, MAX_RECIPIENTS).map((candidate) => candidate.userId);

  // The number that actually matters: how many of them can receive a push at
  // all. Reporting the audience without this makes every campaign look like it
  // reached far more people than it did.
  const withPush =
    userIds.length > 0
      ? (
          await db.pushSubscription.findMany({
            where: { userId: { in: userIds } },
            select: { userId: true },
            distinct: ['userId'],
          })
        ).length
      : 0;

  return { userIds, total, truncated: total > MAX_RECIPIENTS, withPush };
}

/**
 * Sends a campaign and records what went out.
 *
 * In-app notification rows are written for everyone targeted; push is attempted
 * on top for those who granted permission. That ordering matters — the bell icon
 * is the durable channel, and a push failure must not lose the message.
 */
export async function sendCampaign(draft: CampaignDraft, sentByUserId: string) {
  const title = draft.title.trim();
  const body = draft.body.trim();
  if (!title || !body) throw new DomainError('A campaign needs a title and a message.', 422);

  const audience = await previewAudience(draft.target);
  if (audience.userIds.length === 0) {
    throw new DomainError('Nobody matches that audience — nothing was sent.', 409, 'empty_audience');
  }

  await db.notification.createMany({
    data: audience.userIds.map((userId) => ({
      userId,
      type: 'SYSTEM' as const,
      title,
      body,
      href: draft.href,
    })),
  });

  const subscriptions = await db.pushSubscription.findMany({
    where: { userId: { in: audience.userIds } },
  });

  let delivered = 0;
  if (subscriptions.length > 0) {
    const provider = getPushProvider();
    const result = await provider.send(
      subscriptions.map((subscription) => ({
        endpoint: subscription.endpoint,
        p256dh: subscription.p256dh,
        auth: subscription.auth,
      })),
      { title, body, href: draft.href, tag: 'campaign' },
    );
    delivered = result.delivered;

    if (result.expiredEndpoints.length > 0) {
      await db.pushSubscription.deleteMany({ where: { endpoint: { in: result.expiredEndpoints } } });
    }
  }

  return db.pushCampaign.create({
    data: {
      title,
      body,
      href: draft.href,
      city: draft.target.city ?? null,
      centerLatitude: draft.target.latitude ?? null,
      centerLongitude: draft.target.longitude ?? null,
      radiusKm: draft.target.radiusKm ?? null,
      targetedUsers: audience.userIds.length,
      deliveredPushes: delivered,
      sentByUserId,
    },
  });
}

export async function listCampaigns(limit = 25) {
  return db.pushCampaign.findMany({ orderBy: { sentAt: 'desc' }, take: limit });
}

export { CAMPAIGN_TEMPLATES } from '@/lib/domain/campaign-templates';

/** The cities that have customers, for the targeting dropdown. */
export async function listTargetableCities(): Promise<string[]> {
  const rows = await db.customerProfile.groupBy({
    by: ['defaultCity'],
    where: { defaultCity: { not: null } },
    _count: { _all: true },
    orderBy: { _count: { defaultCity: 'desc' } },
    take: 40,
  });

  return rows.map((row) => row.defaultCity).filter((city): city is string => Boolean(city));
}
