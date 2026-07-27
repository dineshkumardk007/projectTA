'use client';

import * as React from 'react';

/**
 * The cart.
 *
 * Deliberately client-side (localStorage) rather than a database table:
 * adding an item must feel instant on a weak connection, and the cart carries
 * no authority — every price is recomputed on the server at checkout, so the
 * worst a tampered cart can do is ask for something the server refuses.
 *
 * One shop at a time. Pickup from two shops is not one journey, and pretending
 * otherwise would break the ready-time promise.
 */

export type CartSelection = { groupId: string; groupName: string; optionIds: string[]; optionNames: string[] };

export type CartItem = {
  /** Stable identity for a product + option combination. */
  key: string;
  productId: string;
  name: string;
  unitPriceMinor: number;
  prepMinutes: number;
  quantity: number;
  selections: CartSelection[];
};

export type Cart = {
  shopId: string;
  shopSlug: string;
  shopName: string;
  items: CartItem[];
};

const STORAGE_KEY = 'takeaway.cart.v1';

type CartContextValue = {
  cart: Cart | null;
  itemCount: number;
  subtotalMinor: number;
  addItem: (shop: { id: string; slug: string; name: string }, item: Omit<CartItem, 'key'>) => 'added' | 'replaced';
  setQuantity: (key: string, quantity: number) => void;
  removeItem: (key: string) => void;
  clear: () => void;
  /** True until localStorage has been read, so the UI can avoid flashing an empty cart. */
  hydrated: boolean;
};

const CartContext = React.createContext<CartContextValue | null>(null);

export function useCart() {
  const ctx = React.useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>.');
  return ctx;
}

export function cartItemKey(productId: string, selections: CartSelection[]): string {
  const optionPart = selections
    .flatMap((s) => s.optionIds)
    .slice()
    .sort()
    .join(',');
  return optionPart ? `${productId}::${optionPart}` : productId;
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = React.useState<Cart | null>(null);
  const [hydrated, setHydrated] = React.useState(false);

  React.useEffect(() => {
    // Reading the persisted cart out of localStorage on mount. This has to be an
    // effect rather than a lazy initialiser: localStorage does not exist during
    // server rendering, and reading it during the first client render would
    // produce a hydration mismatch. `hydrated` is what lets the UI avoid
    // flashing an empty cart in the meantime.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHydrated(true);
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setCart(JSON.parse(raw) as Cart);
    } catch {
      // A corrupt cart should never block the app — start empty instead.
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  React.useEffect(() => {
    if (!hydrated) return;
    if (cart && cart.items.length > 0) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, [cart, hydrated]);

  const addItem = React.useCallback<CartContextValue['addItem']>((shop, item) => {
    const key = cartItemKey(item.productId, item.selections);
    let outcome: 'added' | 'replaced' = 'added';

    setCart((current) => {
      // Switching shops replaces the cart rather than merging.
      if (current && current.shopId !== shop.id) {
        outcome = 'replaced';
        return { shopId: shop.id, shopSlug: shop.slug, shopName: shop.name, items: [{ ...item, key }] };
      }

      const base: Cart = current ?? { shopId: shop.id, shopSlug: shop.slug, shopName: shop.name, items: [] };
      const existing = base.items.find((i) => i.key === key);

      return {
        ...base,
        items: existing
          ? base.items.map((i) => (i.key === key ? { ...i, quantity: i.quantity + item.quantity } : i))
          : [...base.items, { ...item, key }],
      };
    });

    return outcome;
  }, []);

  const setQuantity = React.useCallback((key: string, quantity: number) => {
    setCart((current) => {
      if (!current) return current;
      const items =
        quantity <= 0
          ? current.items.filter((i) => i.key !== key)
          : current.items.map((i) => (i.key === key ? { ...i, quantity: Math.min(quantity, 50) } : i));
      return items.length > 0 ? { ...current, items } : null;
    });
  }, []);

  const removeItem = React.useCallback((key: string) => setQuantity(key, 0), [setQuantity]);
  const clear = React.useCallback(() => setCart(null), []);

  const value = React.useMemo<CartContextValue>(() => {
    const items = cart?.items ?? [];
    return {
      cart,
      hydrated,
      itemCount: items.reduce((sum, i) => sum + i.quantity, 0),
      subtotalMinor: items.reduce((sum, i) => sum + i.unitPriceMinor * i.quantity, 0),
      addItem,
      setQuantity,
      removeItem,
      clear,
    };
  }, [cart, hydrated, addItem, setQuantity, removeItem, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
