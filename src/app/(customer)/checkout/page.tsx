import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/guards';
import { CheckoutScreen } from '@/components/customer/checkout-screen';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Checkout' };

export default async function CheckoutPage() {
  const user = await getCurrentUser();
  // Ordering requires an account — the shop needs someone to hand the order to.
  if (!user) redirect('/signin?next=/checkout');
  if (user.role !== 'CUSTOMER') redirect('/');

  return <CheckoutScreen customerName={user.name} />;
}
