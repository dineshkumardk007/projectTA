import type { Metadata } from 'next';
import { Megaphone } from 'lucide-react';
import { listCampaigns, listTargetableCities } from '@/lib/services/campaigns';
import { providerReadiness } from '@/lib/env';
import { db } from '@/lib/db';
import { Card, SectionHeader } from '@/components/ui/primitives';
import { CampaignComposer } from '@/components/admin/campaign-composer';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Push campaigns' };

export default async function AdminCampaignsPage() {
  const [cities, campaigns, subscribers] = await Promise.all([
    listTargetableCities(),
    listCampaigns(25),
    db.pushSubscription.findMany({ select: { userId: true }, distinct: ['userId'] }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Push campaigns</h1>
        <p className="text-sm text-muted">
          {subscribers.length.toLocaleString('en-IN')} customer
          {subscribers.length === 1 ? '' : 's'} have push notifications switched on. Everyone else still gets
          the message in the app.
        </p>
      </div>

      {!providerReadiness.push ? (
        <Card className="border-warning-500/40 bg-warning-50 p-4 text-sm font-semibold text-warning-700 dark:bg-warning-500/10 dark:text-warning-100">
          Web push is not configured (no VAPID keys), so campaigns will be written to the in-app notification
          list and logged, but no phone will buzz. Set the VAPID keys to send for real.
        </Card>
      ) : null}

      <CampaignComposer cities={cities} />

      <section>
        <SectionHeader title="Sent campaigns" />
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">Sent</th>
                <th scope="col" className="px-4 py-3 font-semibold">Message</th>
                <th scope="col" className="px-4 py-3 font-semibold">Audience</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Targeted</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Pushes delivered</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {campaigns.map((campaign) => (
                <tr key={campaign.id}>
                  <td className="px-4 py-3 text-xs tabular-nums text-muted">
                    {campaign.sentAt.toLocaleString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold">{campaign.title}</p>
                    <p className="max-w-96 text-xs text-muted">{campaign.body}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted">
                    {campaign.city ? <p>{campaign.city}</p> : null}
                    {campaign.centerLatitude != null && campaign.centerLongitude != null ? (
                      <p className="tabular-nums">
                        {campaign.radiusKm ?? 3} km of {campaign.centerLatitude.toFixed(3)},{' '}
                        {campaign.centerLongitude.toFixed(3)}
                      </p>
                    ) : null}
                    {!campaign.city && campaign.centerLatitude == null ? <p>Everyone</p> : null}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">{campaign.targetedUsers}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted">{campaign.deliveredPushes}</td>
                </tr>
              ))}
              {campaigns.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted">
                    <Megaphone aria-hidden className="mx-auto mb-2 size-5" />
                    No campaigns sent yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </Card>
      </section>
    </div>
  );
}
