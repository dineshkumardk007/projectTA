import type { Metadata } from 'next';
import Link from 'next/link';
import { getShopTable } from '@/lib/services/admin';
import { Badge, Card } from '@/components/ui/primitives';
import { BaselineWaitAction, ShopVisibilityAction } from '@/components/admin/row-actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Shops' };

export default async function AdminShopsPage() {
  const shops = await getShopTable();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold">Shops</h1>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">Shop</th>
              <th scope="col" className="px-4 py-3 font-semibold">Category</th>
              <th scope="col" className="px-4 py-3 font-semibold">Live status</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">Items</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">Orders</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">Min saved</th>
              <th scope="col" className="px-4 py-3 font-semibold">Baseline wait</th>
              <th scope="col" className="px-4 py-3 font-semibold">Visible</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {shops.map((shop) => (
              <tr key={shop.id}>
                <td className="px-4 py-3">
                  <Link href={`/shops/${shop.slug}`} className="font-semibold text-brand-600 hover:underline">
                    {shop.name}
                  </Link>
                  <p className="text-xs text-muted">
                    {shop.merchantName} · {shop.city}
                  </p>
                </td>
                <td className="px-4 py-3 text-muted">{shop.category}</td>
                <td className="px-4 py-3">
                  <Badge
                    tone={
                      shop.status === 'OPEN'
                        ? 'success'
                        : shop.status === 'BUSY'
                          ? 'warning'
                          : shop.status === 'VERY_BUSY'
                            ? 'danger'
                            : 'neutral'
                    }
                  >
                    {shop.status.replace('_', ' ')}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{shop.productCount}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {shop.completedOrders}
                  <span className="text-muted"> / {shop.totalOrders}</span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{shop.minutesSaved}</td>
                <td className="px-4 py-3">
                  <BaselineWaitAction shopId={shop.id} value={shop.baselineWaitMinutes} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Badge tone={shop.isActive && shop.isVerified ? 'success' : 'neutral'}>
                      {shop.isActive && shop.isVerified ? 'Listed' : 'Hidden'}
                    </Badge>
                    <ShopVisibilityAction shopId={shop.id} isActive={shop.isActive} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
