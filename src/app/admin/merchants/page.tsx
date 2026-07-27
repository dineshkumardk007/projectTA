import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { Badge, Card } from '@/components/ui/primitives';
import { MerchantVerificationActions } from '@/components/admin/row-actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Merchants' };

const TONE = {
  PENDING: 'warning',
  VERIFIED: 'success',
  REJECTED: 'danger',
  SUSPENDED: 'neutral',
} as const;

export default async function AdminMerchantsPage() {
  const merchants = await db.merchant.findMany({
    orderBy: [{ verificationStatus: 'asc' }, { createdAt: 'desc' }],
    include: {
      user: { select: { name: true, email: true, phone: true, isActive: true } },
      shops: { select: { id: true, name: true, isVerified: true } },
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">Merchants</h1>
        <p className="text-sm text-muted">
          Verifying a merchant makes all of their shops visible to customers immediately.
        </p>
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">Business</th>
              <th scope="col" className="px-4 py-3 font-semibold">Contact</th>
              <th scope="col" className="px-4 py-3 font-semibold">Shops</th>
              <th scope="col" className="px-4 py-3 font-semibold">Status</th>
              <th scope="col" className="px-4 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {merchants.map((merchant) => (
              <tr key={merchant.id}>
                <td className="px-4 py-3">
                  <p className="font-semibold">{merchant.businessName}</p>
                  <p className="text-xs text-muted">{merchant.user.name}</p>
                </td>
                <td className="px-4 py-3 text-muted">
                  <p>{merchant.user.email}</p>
                  <p className="text-xs">{merchant.contactPhone}</p>
                </td>
                <td className="px-4 py-3">
                  {merchant.shops.length === 0 ? (
                    <span className="text-muted">No shop yet</span>
                  ) : (
                    <ul className="space-y-0.5">
                      {merchant.shops.map((shop) => (
                        <li key={shop.id} className="text-xs">
                          {shop.name} {shop.isVerified ? '' : '(hidden)'}
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
                <td className="px-4 py-3">
                  <Badge tone={TONE[merchant.verificationStatus]}>{merchant.verificationStatus}</Badge>
                </td>
                <td className="px-4 py-3">
                  <MerchantVerificationActions
                    merchantId={merchant.id}
                    status={merchant.verificationStatus}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
