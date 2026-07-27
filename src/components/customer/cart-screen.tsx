'use client';

import Link from 'next/link';
import { Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/states';
import { useCart } from '@/components/customer/cart-store';
import { formatMinor } from '@/lib/domain/money';

/** Review and adjust the cart before checkout. */
export function CartScreen() {
  const { cart, itemCount, subtotalMinor, setQuantity, clear, hydrated } = useCart();

  if (!hydrated) {
    return <div className="h-64 animate-pulse rounded-[var(--radius-card)] bg-surface-muted" />;
  }

  if (!cart || itemCount === 0) {
    return (
      <EmptyState
        icon={<ShoppingBag aria-hidden className="size-7" />}
        title="Your cart is empty"
        description="Find a shop near you and order ahead — your food is prepared while you travel."
        action={
          <Button asChild>
            <Link href="/shops">Browse shops</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">Your order</h1>
        <p className="mt-1 text-sm text-muted">
          Pickup from{' '}
          <Link href={`/shops/${cart.shopSlug}`} className="font-semibold text-brand-600 hover:underline">
            {cart.shopName}
          </Link>
        </p>
      </div>

      <Card className="divide-y divide-border">
        {cart.items.map((item) => (
          <div key={item.key} className="flex gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="font-bold leading-tight">{item.name}</p>

              {item.selections.length > 0 ? (
                <ul className="mt-1 space-y-0.5">
                  {item.selections.map((selection) => (
                    <li key={selection.groupId} className="text-xs text-muted">
                      {selection.groupName}: {selection.optionNames.join(', ')}
                    </li>
                  ))}
                </ul>
              ) : null}

              <p className="mt-1.5 text-sm font-semibold">{formatMinor(item.unitPriceMinor)} each</p>
            </div>

            <div className="flex flex-col items-end gap-2">
              <p className="font-bold">{formatMinor(item.unitPriceMinor * item.quantity)}</p>

              <div className="flex items-center gap-1 rounded-[var(--radius-field)] border border-border p-0.5">
                <button
                  type="button"
                  onClick={() => setQuantity(item.key, item.quantity - 1)}
                  aria-label={`Reduce ${item.name} quantity`}
                  className="flex size-8 items-center justify-center rounded-md text-foreground hover:bg-surface-muted"
                >
                  {item.quantity === 1 ? (
                    <Trash2 aria-hidden className="size-3.5 text-danger-600" />
                  ) : (
                    <Minus aria-hidden className="size-3.5" />
                  )}
                </button>
                <span aria-live="polite" className="w-6 text-center text-sm font-bold">
                  {item.quantity}
                </span>
                <button
                  type="button"
                  onClick={() => setQuantity(item.key, item.quantity + 1)}
                  aria-label={`Increase ${item.name} quantity`}
                  className="flex size-8 items-center justify-center rounded-md text-foreground hover:bg-surface-muted"
                >
                  <Plus aria-hidden className="size-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </Card>

      <Card className="p-4">
        <div className="flex items-center justify-between text-base font-bold">
          <span>Subtotal</span>
          <span>{formatMinor(subtotalMinor)}</span>
        </div>
        <p className="mt-1 text-xs text-muted">
          Final preparation time and pickup time are confirmed on the next screen.
        </p>
      </Card>

      <div className="grid gap-2">
        <Button asChild size="lg">
          <Link href="/checkout">Continue to checkout</Link>
        </Button>
        <div className="flex gap-2">
          <Button asChild variant="outline" className="flex-1">
            <Link href={`/shops/${cart.shopSlug}`}>Add more items</Link>
          </Button>
          <Button variant="ghost" className="flex-1 text-danger-600" onClick={clear}>
            Clear cart
          </Button>
        </div>
      </div>
    </div>
  );
}
