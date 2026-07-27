import type { Metadata } from 'next';
import { requireMerchantContext } from '@/lib/services/merchant';
import { OrderBoard } from '@/components/merchant/order-board';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Orders' };

export default async function MerchantOrdersPage() {
  const { shop } = await requireMerchantContext();

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-extrabold">Orders</h1>
        <p className="text-sm text-muted">{shop.name} · updates automatically</p>
      </header>
      <OrderBoard shopId={shop.id} />
    </div>
  );
}
