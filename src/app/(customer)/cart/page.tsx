import type { Metadata } from 'next';
import { CartScreen } from '@/components/customer/cart-screen';

export const metadata: Metadata = { title: 'Your cart' };

export default function CartPage() {
  return <CartScreen />;
}
