'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Heart } from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';

/** Optimistic favourite toggle — reverts if the server disagrees. */
export function FavoriteButton({
  shopId,
  initial,
  signedIn,
}: {
  shopId: string;
  initial: boolean;
  signedIn: boolean;
}) {
  const [favorite, setFavorite] = React.useState(initial);
  const [pending, setPending] = React.useState(false);
  const { toast } = useToast();
  const router = useRouter();

  async function toggle() {
    if (!signedIn) {
      router.push(`/signin?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }

    const next = !favorite;
    setFavorite(next);
    setPending(true);

    try {
      const response = await fetch(`/api/shops/${shopId}/favorite`, {
        method: next ? 'POST' : 'DELETE',
      });
      if (!response.ok) throw new Error('failed');
      toast(next ? 'Saved to favourites' : 'Removed from favourites');
    } catch {
      setFavorite(!next);
      toast('We could not update your favourites.', 'error');
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={favorite}
      aria-label={favorite ? 'Remove from favourites' : 'Save to favourites'}
      className="flex size-10 items-center justify-center rounded-full bg-surface/90 shadow-[var(--shadow-card)] backdrop-blur transition-transform active:scale-95"
    >
      <Heart
        aria-hidden
        className={cn('size-5 transition-colors', favorite ? 'fill-brand-500 text-brand-500' : 'text-muted')}
      />
    </button>
  );
}
