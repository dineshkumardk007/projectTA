import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/guards';
import { CartProvider } from '@/components/customer/cart-store';
import { LocationProvider } from '@/components/customer/location-store';
import { CustomerBottomNav, CustomerHeader, FloatingCartBar } from '@/components/customer/app-chrome';

/**
 * Shell for every customer-facing screen.
 *
 * The unread count is fetched here but deliberately *not* awaited before
 * rendering: a badge on a bell icon is not worth delaying the whole page for.
 * `CustomerHeader` takes the promise and resolves it inside its own Suspense
 * boundary, so the page streams immediately and the badge fills in when it can.
 */
export default async function CustomerLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  const unreadCountPromise = user
    ? db.notification
        .count({ where: { userId: user.id, readAt: null } })
        // A badge is not worth an error boundary. If the count fails, show none.
        .catch(() => 0)
    : Promise.resolve(0);

  return (
    <LocationProvider>
      <CartProvider>
        <div className="min-h-dvh pb-24">
          <CustomerHeader unreadCount={unreadCountPromise} signedIn={Boolean(user)} />
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
