'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useCart } from '@/components/customer/cart-store';

/**
 * One-tap "order again".
 *
 * The cart is rebuilt from the *server*, not from whatever the page happens to
 * be showing: prices, availability and option names are re-read, so an item that
 * has since gone off the menu is reported rather than silently reappearing at
 * yesterday's price.
 */
export function ReorderButton({
  orderId,
  className,
  size = 'sm',
  variant = 'secondary',
  label = 'Order again',
}: {
  orderId: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'action';
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  label?: string;
}) {
  const router = useRouter();
  const { addItem, clear } = useCart();
  const { toast } = useToast();
  const [pending, setPending] = React.useState(false);

  async function reorder() {
    setPending(true);
    try {
      const response = await fetch(`/api/orders/${orderId}/reorder`, { method: 'POST' });
      const data = (await response.json()) as {
        error?: string;
        shop?: { id: string; slug: string; name: string };
        items?: {
          productId: string;
          name: string;
          unitPriceMinor: number;
          prepMinutes: number;
          quantity: number;
          selections: { groupId: string; groupName: string; optionIds: string[]; optionNames: string[] }[];
        }[];
        skipped?: string[];
      };

      if (!response.ok || !data.shop || !data.items) {
        toast(data.error ?? 'We could not rebuild that order.', 'error');
        return;
      }

      clear();
      for (const item of data.items) {
        addItem(data.shop, {
          productId: item.productId,
          name: item.name,
          unitPriceMinor: item.unitPriceMinor,
          prepMinutes: item.prepMinutes,
          quantity: item.quantity,
          selections: item.selections,
        });
      }

      if (data.skipped && data.skipped.length > 0) {
        toast(`${data.skipped.join(', ')} is unavailable and was left out.`, 'info');
      }
      router.push('/cart');
    } catch {
      toast('We could not reach the server. Please try again.', 'error');
    } finally {
      setPending(false);
    }
  }

  return (
    <Button size={size} variant={variant} className={className} loading={pending} onClick={reorder}>
      <RotateCcw aria-hidden className="size-4" />
      {label}
    </Button>
  );
}
