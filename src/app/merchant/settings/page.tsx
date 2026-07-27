import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '@/lib/db';
import { requireMerchantContext } from '@/lib/services/merchant';
import { renderShopQr } from '@/lib/services/pickup';
import { ShopSettingsForm } from '@/components/merchant/shop-settings-form';
import { Card } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { SignOutButton } from '@/components/auth/sign-out-button';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Shop settings' };

export default async function ShopSettingsPage() {
  const { shop } = await requireMerchantContext();

  const [hours, qr] = await Promise.all([
    db.shopOperatingHours.findMany({ where: { shopId: shop.id }, orderBy: { dayOfWeek: 'asc' } }),
    renderShopQr(shop.publicQrToken),
  ]);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-extrabold">Shop settings</h1>
        <p className="text-sm text-muted">{shop.name}</p>
      </header>

      <Card className="p-4">
        <h2 className="font-bold">Your shop QR code</h2>
        <p className="mt-1 text-sm text-muted">
          Print this and put it on the counter. Customers scan it to open your menu and order ahead — this is the
          cheapest way to get regulars using pre-order.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- generated data URL. */}
          <img
            src={qr.dataUrl}
            alt={`QR code linking to ${shop.name} on Takeaway`}
            width={160}
            height={160}
            className="size-40 rounded-[var(--radius-field)] bg-white p-2 shadow-[var(--shadow-card)]"
          />
          <div className="min-w-0 flex-1">
            <p className="break-all text-xs text-muted">{qr.url}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <a href={qr.dataUrl} download={`${shop.slug}-takeaway-qr.png`}>
                  Download QR
                </a>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link href={`/shops/${shop.slug}`}>Preview your shop page</Link>
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <ShopSettingsForm
        shop={{
          id: shop.id,
          name: shop.name,
          tagline: shop.tagline,
          description: shop.description,
          addressLine: shop.addressLine,
          phone: shop.phone,
          basePrepMinutes: shop.basePrepMinutes,
          maxActiveOrders: shop.maxActiveOrders,
          acceptsCashOnPickup: shop.acceptsCashOnPickup,
          acceptsOnlinePayment: shop.acceptsOnlinePayment,
          upiId: shop.upiId,
          upiPayeeName: shop.upiPayeeName,
          upiDepositPercent: shop.upiDepositPercent,
          allowUpiDeposit: shop.allowUpiDeposit,
          operatingHours: hours.map((h) => ({
            dayOfWeek: h.dayOfWeek,
            opensAt: h.opensAt,
            closesAt: h.closesAt,
            isClosed: h.isClosed,
          })),
        }}
      />

      <SignOutButton />
    </div>
  );
}
