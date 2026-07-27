import { z } from 'zod';
import { clientKey, ok, rateLimit, route, validateSameOrigin } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { previewAudience, sendCampaign } from '@/lib/services/campaigns';

const targetSchema = z.object({
  city: z.string().trim().max(80).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  radiusKm: z.number().min(0.2).max(50).optional(),
  orderedBefore: z.boolean().optional(),
});

const schema = z.object({
  title: z.string().trim().min(3, 'Give the campaign a title.').max(60),
  body: z.string().trim().min(5, 'Write the message.').max(240),
  href: z.string().trim().max(200).optional(),
  target: targetSchema.default({}),
  /** True to only count the audience, without sending anything. */
  previewOnly: z.boolean().default(false),
});

/**
 * Dispatch a push campaign.
 *
 * Rate-limited hard — three sends a minute. This is the one endpoint in the
 * system that writes to thousands of people's phones, and an admin with a stuck
 * button should hit a limit long before their customers do.
 */
export const POST = route(async (request: Request) => {
  validateSameOrigin(request);
  const admin = await requireUser(['ADMIN']);

  const body = schema.parse(await request.json());

  if (body.previewOnly) {
    const audience = await previewAudience(body.target);
    return ok({
      total: audience.total,
      reachable: audience.withPush,
      willSendTo: audience.userIds.length,
      truncated: audience.truncated,
    });
  }

  rateLimit(clientKey(request, `campaign:${admin.id}`), 3, 60_000);

  const campaign = await sendCampaign(
    { title: body.title, body: body.body, href: body.href || undefined, target: body.target },
    admin.id,
  );

  return ok(
    {
      id: campaign.id,
      targetedUsers: campaign.targetedUsers,
      deliveredPushes: campaign.deliveredPushes,
      sentAt: campaign.sentAt,
    },
    201,
  );
});
