import type { Metadata } from 'next';
import { requireMerchantContext } from '@/lib/services/merchant';
import { PickupScanner } from '@/components/merchant/pickup-scanner';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Verify pickup' };

export default async function ScanPage() {
  const { shop } = await requireMerchantContext();

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-extrabold">Verify pickup</h1>
        <p className="text-sm text-muted">{shop.name}</p>
      </header>
      <PickupScanner shopId={shop.id} />
    </div>
  );
}
