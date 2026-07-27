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
      {/* The name is passed down rather than looked up in the client: it goes on
          the printed kitchen slip and into the WhatsApp message, and "Store" on
          a customer's phone is worse than no message. */}
      <OrderBoard shopId={shop.id} shopName={shop.name} />
    </div>
  );
}
