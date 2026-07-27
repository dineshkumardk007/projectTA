import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/guards';
import { CartProvider } from '@/components/customer/cart-store';
import { LocationProvider } from '@/components/customer/location-store';
import { CustomerBottomNav, CustomerHeader, FloatingCartBar } from '@/components/customer/app-chrome';

/** Shell for every customer-facing screen. */
export default async function CustomerLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  const unreadCount = user
    ? await db.notification.count({ where: { userId: user.id, readAt: null } })
    : 0;

  return (
    <LocationProvider>
      <CartProvider>
        <div className="min-h-dvh pb-24">
          <CustomerHeader unreadCount={unreadCount} signedIn={Boolean(user)} />
          <main id="main" className="mx-auto max-w-3xl px-4 py-4">
            {children}
          </main>
          <FloatingCartBar />
          <CustomerBottomNav />
        </div>
      </CartProvider>
    </LocationProvider>
  );
}
