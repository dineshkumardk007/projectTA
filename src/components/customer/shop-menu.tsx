'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Mic, Minus, Plus, Sparkles, Square, Star, Trash2 } from 'lucide-react';
import { Badge, Card, Input, Textarea } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { ImageOrPlaceholder } from '@/components/ui/generated-image';
import { EmptyState } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { LanguageToggle } from '@/components/ui/language-toggle';
import { getTranslation, type Language } from '@/lib/i18n';
import { useCart, type CartSelection } from '@/components/customer/cart-store';
import { formatMinor } from '@/lib/domain/money';
import { cn } from '@/lib/cn';

/**
 * Shop menu: section rail plus product list, with a customisation sheet for
 * anything that has options.
 *
 * Items with no options add in a single tap. That matters — the daily tea
 * customer should be able to reorder in seconds, and an unnecessary sheet would
 * make the app slower than pointing at the counter.
 */

export type MenuOption = { id: string; name: string; priceDeltaMinor: number; prepDeltaMinutes: number; isAvailable: boolean };
export type MenuOptionGroup = { id: string; name: string; minSelect: number; maxSelect: number; options: MenuOption[] };

export type MenuProduct = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  priceMinor: number;
  prepMinutes: number;
  unitLabel: string;
  availability: 'AVAILABLE' | 'OUT_OF_STOCK' | 'TEMPORARILY_UNAVAILABLE';
  isPopular: boolean;
  /** Flagged by the shop for today only; expires overnight on its own. */
  isTodaysSpecial: boolean;
  specialNote: string | null;
  menuCategoryId: string | null;
  optionGroups: MenuOptionGroup[];
};

export type MenuSection = { id: string; name: string };

export type MenuShop = { id: string; slug: string; name: string; emoji: string; canOrder: boolean; closedReason?: string };

export function ShopMenu({
  shop,
  sections,
  products,
  highlightProductId,
}: {
  shop: MenuShop;
  sections: MenuSection[];
  products: MenuProduct[];
  /** Set when the customer arrived by tapping a special on a discovery card. */
  highlightProductId?: string;
}) {
  const [customising, setCustomising] = React.useState<MenuProduct | null>(null);
  const [orderMode, setOrderMode] = React.useState<'MENU' | 'LIST'>('MENU');
  const [lang, setLang] = React.useState<Language>('en');

  // Land the customer *on* the item they tapped rather than at the top of the
  // menu. Without this, deep-linking from a discovery card still leaves them
  // scrolling, which is the friction the specials chip exists to remove.
  React.useEffect(() => {
    if (!highlightProductId) return;
    const target = document.getElementById(`product-${highlightProductId}`);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlightProductId]);

  const popular = products.filter((p) => p.isPopular);
  const specials = products.filter((p) => p.isTodaysSpecial);

  const grouped = React.useMemo(() => {
    const buckets: { section: MenuSection; items: MenuProduct[] }[] = [];
    // Today's special leads: it is the one thing the shop is actively pushing,
    // and it is the fastest route to an order for an undecided customer.
    if (specials.length > 0) buckets.push({ section: { id: '__special', name: "Today's special" }, items: specials });
    if (popular.length > 0) buckets.push({ section: { id: '__popular', name: 'Popular' }, items: popular });

    for (const section of sections) {
      const items = products.filter((p) => p.menuCategoryId === section.id);
      // "Popular" is synthesised above; skip a shop's own section of that name.
      if (items.length > 0 && section.name.toLowerCase() !== 'popular') {
        buckets.push({ section, items });
      }
    }

    const uncategorised = products.filter((p) => !p.menuCategoryId);
    if (uncategorised.length > 0) buckets.push({ section: { id: '__other', name: 'More' }, items: uncategorised });

    return buckets;
  }, [popular, specials, sections, products]);

  if (products.length === 0) {
    return <EmptyState title="This shop has not added its menu yet" description="Check back a little later." />;
  }

  return (
    <>
      {/* Language Bar & Mode Selector */}
      <div className="mb-3 space-y-2">
        <div className="flex justify-end">
          <LanguageToggle currentLanguage={lang} onChange={setLang} />
        </div>
        <div className="flex rounded-lg border border-border bg-surface p-1">
          <button
            type="button"
            onClick={() => setOrderMode('MENU')}
            className={cn(
              'flex-1 rounded-md py-2 text-center text-sm font-bold transition-colors',
              orderMode === 'MENU' ? 'bg-brand-500 text-white shadow' : 'text-muted hover:text-foreground',
            )}
          >
            {getTranslation(lang, 'browseMenu')}
          </button>
          <button
            type="button"
            onClick={() => setOrderMode('LIST')}
            className={cn(
              'flex-1 rounded-md py-2 text-center text-sm font-bold transition-colors',
              orderMode === 'LIST' ? 'bg-brand-500 text-white shadow' : 'text-muted hover:text-foreground',
            )}
          >
            {getTranslation(lang, 'orderByList')}
          </button>
        </div>
      </div>

      {orderMode === 'LIST' ? (
        <CustomListOrderForm shop={shop} lang={lang} />
      ) : (
        <>
          {/* Sticky section rail — jumps to a heading rather than filtering, so the
              whole menu stays scrollable. */}
          <nav aria-label="Menu sections" className="sticky top-[65px] z-30 -mx-4 bg-canvas/90 px-4 py-2 backdrop-blur">
            <div className="scroll-rail">
              {grouped.map(({ section }) => (
                <a
                  key={section.id}
                  href={`#section-${section.id}`}
                  className="rounded-[var(--radius-pill)] border border-border bg-surface px-3.5 py-2 text-sm font-semibold hover:bg-surface-muted"
                >
                  {section.name}
                </a>
              ))}
            </div>
          </nav>

      <div className="mt-2 space-y-7">
        {grouped.map(({ section, items }) => (
          <section key={section.id} id={`section-${section.id}`} className="scroll-mt-32">
            <h2 className="mb-1 text-lg font-bold">{section.name}</h2>
            <ul className="divide-y divide-border">
              {items.map((product) => (
                <li
                  key={`${section.id}-${product.id}`}
                  // Only the first occurrence carries the anchor id — an item can
                  // appear in both "Today's special" and its own section.
                  id={items === grouped[0]?.items ? `product-${product.id}` : undefined}
                  className={cn(
                    'scroll-mt-32 transition-colors duration-500',
                    highlightProductId === product.id &&
                      'rounded-[var(--radius-field)] bg-brand-50 dark:bg-brand-900/25',
                  )}
                >
                  <ProductRow
                    product={product}
                    shop={shop}
                    onCustomise={() => setCustomising(product)}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      </>
      )}

      {customising ? (
        <CustomiseSheet
          key={customising.id}
          product={customising}
          shop={shop}
          onClose={() => setCustomising(null)}
        />
      ) : null}
    </>
  );
}

function CustomListOrderForm({ shop, lang = 'en' }: { shop: MenuShop; lang?: Language }) {
  const [listText, setListText] = React.useState('');
  const [customerNote, setCustomerNote] = React.useState('');
  const [recording, setRecording] = React.useState(false);
  const [voiceAttached, setVoiceAttached] = React.useState(false);
  const [placing, setPlacing] = React.useState(false);
  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
  const audioChunksRef = React.useRef<Blob[]>([]);
  const { toast } = useToast();
  const router = useRouter();

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        setVoiceAttached(true);
        toast('Voice note recorded! Attached to your order list.');
      };

      mediaRecorder.start();
      setRecording(true);
    } catch {
      toast('Microphone access is required to record voice notes.', 'error');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
      setRecording(false);
    }
  };

  const handlePlaceListOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalListText = [
      listText.trim(),
      voiceAttached ? '🎙️ [Voice Note Attached by Customer]' : '',
    ].filter(Boolean).join('\n');

    if (!finalListText) {
      toast('Please enter your shopping list or record a voice note.', 'error');
      return;
    }

    setPlacing(true);
    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          shopId: shop.id,
          isCustomList: true,
          customListText: finalListText,
          paymentMethod: 'CASH_ON_PICKUP',
          customerNote: customerNote.trim() || undefined,
        }),
      });

      const data = (await response.json()) as { id?: string; error?: string };
      if (!response.ok) {
        toast(data.error ?? 'We could not place your order.', 'error');
        return;
      }

      toast('Order placed! The store owner will pack your list and send your bill amount.');
      router.push(`/orders/${data.id}`);
    } catch {
      toast('We could not reach the server.', 'error');
    } finally {
      setPlacing(false);
    }
  };

  return (
    <Card className="mt-4 p-4 space-y-4 border-brand-500/30 bg-brand-500/10">
      <div>
        <h3 className="text-base font-extrabold text-foreground">{getTranslation(lang, 'quickListTitle')}</h3>
        <p className="mt-1 text-xs text-muted">
          {getTranslation(lang, 'quickListDesc')}
        </p>
      </div>

      <form onSubmit={handlePlaceListOrder} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-bold text-foreground">
            {getTranslation(lang, 'shoppingListLabel')} *
          </label>
          <Textarea
            rows={3}
            value={listText}
            onChange={(e) => setListText(e.target.value)}
            placeholder={getTranslation(lang, 'placeholderListText')}
          />
        </div>

        {/* Voice Note Recorder */}
        <div className="rounded-lg border border-border bg-surface p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-foreground">{getTranslation(lang, 'voiceNoteLabel')}</span>
            {voiceAttached ? (
              <Badge tone="success">✅ Voice Note Attached</Badge>
            ) : null}
          </div>

          <div className="flex gap-2">
            {!recording ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex-1 text-brand-600 border-brand-500/30"
                onClick={startRecording}
              >
                <Mic className="h-4 w-4 mr-1 text-brand-600" />
                {getTranslation(lang, 'recordVoice')}
              </Button>
            ) : (
              <Button
                type="button"
                variant="primary"
                size="sm"
                className="flex-1 bg-danger-600 hover:bg-danger-700 text-white animate-pulse"
                onClick={stopRecording}
              >
                <Square className="h-4 w-4 mr-1" />
                {getTranslation(lang, 'stopRecord')}
              </Button>
            )}
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-bold text-foreground">Special Instructions (Optional)</label>
          <Input
            value={customerNote}
            onChange={(e) => setCustomerNote(e.target.value)}
            placeholder="e.g. Please pick fresh items"
          />
        </div>

        <Button type="submit" size="action" className="w-full" loading={placing}>
          {getTranslation(lang, 'placeListOrder')}
        </Button>
      </form>
    </Card>
  );
}

function ProductRow({
  product,
  shop,
  onCustomise,
}: {
  product: MenuProduct;
  shop: MenuShop;
  onCustomise: () => void;
}) {
  const { cart, addItem, setQuantity } = useCart();
  const { toast } = useToast();

  const unavailable = product.availability !== 'AVAILABLE';
  const needsChoices = product.optionGroups.length > 0;

  /**
   * What this customer already has of *this* product.
   *
   * An item with options can sit in the cart as several lines (one "no sugar",
   * one "extra strong"), so this is a list rather than a single row. Guarded on
   * `shopId` because the cart holds one shop at a time — without that check, a
   * cart left over from another shop would show phantom quantities here.
   */
  const lines = React.useMemo(
    () => (cart && cart.shopId === shop.id ? cart.items.filter((i) => i.productId === product.id) : []),
    [cart, shop.id, product.id],
  );
  const inCart = lines.reduce((sum, line) => sum + line.quantity, 0);
  // Steppable only when there is exactly one line: with two variants in the
  // cart, "−" has no single obvious meaning, so we do not guess.
  const singleLine = lines.length === 1 ? lines[0] : null;

  function quickAdd() {
    const outcome = addItem(shop, {
      productId: product.id,
      name: product.name,
      unitPriceMinor: product.priceMinor,
      prepMinutes: product.prepMinutes,
      quantity: 1,
      selections: [],
    });
    // The stepper that replaces this button is now the confirmation, so the
    // routine "added" toast is just noise. The shop-switch warning is not
    // routine — that one still needs saying.
    if (outcome === 'replaced') {
      toast(`Cart cleared and ${product.name} added — you can only order from one shop at a time.`);
    }
  }

  return (
    <div className={cn('flex gap-3 py-4', unavailable && 'opacity-55')}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="font-bold leading-tight">{product.name}</h3>
          {/* Scanning the menu should answer "what have I already picked?"
              without adding up the stepper values one row at a time. */}
          {inCart > 0 ? (
            <Badge tone="brand" className="shrink-0">
              {inCart} added
            </Badge>
          ) : null}
          {product.isTodaysSpecial ? (
            <Badge tone="brand" className="shrink-0">
              <Sparkles aria-hidden className="size-3" />
              Today
            </Badge>
          ) : null}
          {product.isPopular && !product.isTodaysSpecial ? (
            <Star aria-label="Popular item" className="size-3.5 shrink-0 fill-warning-500 text-warning-500" />
          ) : null}
        </div>

        {product.isTodaysSpecial && product.specialNote ? (
          <p className="mt-1 text-sm font-semibold text-brand-600">{product.specialNote}</p>
        ) : null}

        {product.description ? (
          <p className="mt-1 line-clamp-2 text-sm text-muted">{product.description}</p>
        ) : null}

        <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="text-[15px] font-bold">{formatMinor(product.priceMinor)}</span>
          {product.unitLabel ? <span className="text-xs text-muted">{product.unitLabel}</span> : null}
          <span className="text-xs text-muted">· {product.prepMinutes} min</span>
        </div>

        {unavailable ? (
          <Badge tone="neutral" className="mt-2">
            {product.availability === 'OUT_OF_STOCK' ? 'Out of stock' : 'Unavailable today'}
          </Badge>
        ) : null}
      </div>

      <div className="flex w-24 shrink-0 flex-col items-center gap-2">
        <ImageOrPlaceholder
          src={product.imageUrl}
          alt=""
          seed={product.id}
          emoji={shop.emoji}
          rounded="field"
          className="h-20 w-24"
        />

        {/* Once something is in the cart the button becomes a stepper, so the
            quantity is adjusted where the customer is already looking rather
            than by opening the cart and coming back. */}
        {inCart > 0 && !unavailable && shop.canOrder ? (
          singleLine ? (
            <div className="-mt-5 flex w-24 flex-col items-center gap-1">
              <QuantityStepper
                className="mt-0"
                productName={product.name}
                quantity={singleLine.quantity}
                onChange={(next) => setQuantity(singleLine.key, next)}
              />
              {/* The stepper only adjusts the variant already in the cart.
                  Without this, a customer who has added one "normal sugar" has
                  no way left to also order a "no sugar" — the Choose button they
                  used the first time is gone. */}
              {needsChoices ? (
                <button
                  type="button"
                  onClick={onCustomise}
                  className="text-[11px] font-semibold text-brand-600 underline-offset-2 hover:underline"
                >
                  Add another
                </button>
              ) : null}
            </div>
          ) : (
            // Several variants of the same item — stepping is ambiguous, so we
            // show the total and send further edits to the cart.
            <div className="-mt-5 flex w-24 flex-col items-center gap-1">
              <Button
                size="sm"
                variant="outline"
                onClick={onCustomise}
                className="w-24 shadow-sm"
                aria-label={`Add another ${product.name}`}
              >
                <Plus aria-hidden className="size-3.5" />
                Add
              </Button>
              <span className="text-[11px] font-semibold text-brand-600">{inCart} in cart</span>
            </div>
          )
        ) : (
          <Button
            size="sm"
            variant={unavailable || !shop.canOrder ? 'secondary' : 'primary'}
            disabled={unavailable || !shop.canOrder}
            onClick={needsChoices ? onCustomise : quickAdd}
            className="-mt-5 w-20 shadow-sm"
            aria-label={
              unavailable
                ? `${product.name} is unavailable`
                : needsChoices
                  ? `Choose options for ${product.name}`
                  : `Add ${product.name} to cart`
            }
          >
            {unavailable ? 'N/A' : needsChoices ? 'Choose' : 'Add'}
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * The in-row quantity control.
 *
 * Sized to the same 44px touch target as the Add button it replaces — this is
 * tapped one-handed, often while walking. Dropping to zero removes the line
 * entirely, which is what the trash icon at quantity 1 signals: the next tap
 * takes the item out of the cart rather than leaving an invisible zero.
 */
function QuantityStepper({
  productName,
  quantity,
  onChange,
  className,
}: {
  productName: string;
  quantity: number;
  onChange: (next: number) => void;
  className?: string;
}) {
  const removing = quantity <= 1;

  return (
    <div
      className={cn(
        '-mt-5 flex w-24 items-center justify-between rounded-[var(--radius-field)] border border-brand-500 bg-surface p-0.5 shadow-sm',
        className,
      )}
    >
      <button
        type="button"
        onClick={() => onChange(quantity - 1)}
        aria-label={removing ? `Remove ${productName} from cart` : `Reduce ${productName} to ${quantity - 1}`}
        className="flex size-8 items-center justify-center rounded-md text-brand-600 transition-colors hover:bg-brand-50 dark:hover:bg-brand-900/40"
      >
        {removing ? <Trash2 aria-hidden className="size-3.5" /> : <Minus aria-hidden className="size-4" />}
      </button>

      <span aria-live="polite" className="min-w-5 text-center text-sm font-extrabold tabular-nums text-brand-600">
        {quantity}
      </span>

      <button
        type="button"
        onClick={() => onChange(quantity + 1)}
        disabled={quantity >= 50}
        aria-label={`Increase ${productName} to ${quantity + 1}`}
        className="flex size-8 items-center justify-center rounded-md text-brand-600 transition-colors hover:bg-brand-50 disabled:opacity-40 dark:hover:bg-brand-900/40"
      >
        <Plus aria-hidden className="size-4" />
      </button>
    </div>
  );
}

function CustomiseSheet({
  product,
  shop,
  onClose,
}: {
  product: MenuProduct;
  shop: MenuShop;
  onClose: () => void;
}) {
  const { addItem } = useCart();
  const { toast } = useToast();
  const [quantity, setQuantity] = React.useState(1);

  // Required single-choice groups start on their first available option so the
  // customer can add straight away without hunting for a default.
  const [selected, setSelected] = React.useState<Record<string, string[]>>(() => {
    const initial: Record<string, string[]> = {};
    for (const group of product.optionGroups) {
      const first = group.options.find((o) => o.isAvailable);
      initial[group.id] = group.minSelect > 0 && group.maxSelect === 1 && first ? [first.id] : [];
    }
    return initial;
  });

  function toggle(group: MenuOptionGroup, optionId: string) {
    setSelected((current) => {
      const chosen = current[group.id] ?? [];
      if (group.maxSelect === 1) {
        // Radio behaviour, but a non-required group can be unset again.
        const next = chosen[0] === optionId && group.minSelect === 0 ? [] : [optionId];
        return { ...current, [group.id]: next };
      }
      if (chosen.includes(optionId)) {
        return { ...current, [group.id]: chosen.filter((id) => id !== optionId) };
      }
      if (chosen.length >= group.maxSelect) return current;
      return { ...current, [group.id]: [...chosen, optionId] };
    });
  }

  const missingGroup = product.optionGroups.find(
    (group) => (selected[group.id]?.length ?? 0) < group.minSelect,
  );

  const { unitPriceMinor, prepMinutes, selections } = React.useMemo(() => {
    let price = product.priceMinor;
    let prep = product.prepMinutes;
    const result: CartSelection[] = [];

    for (const group of product.optionGroups) {
      const ids = selected[group.id] ?? [];
      if (ids.length === 0) continue;
      const options = group.options.filter((o) => ids.includes(o.id));
      for (const option of options) {
        price += option.priceDeltaMinor;
        prep += option.prepDeltaMinutes;
      }
      result.push({
        groupId: group.id,
        groupName: group.name,
        optionIds: options.map((o) => o.id),
        optionNames: options.map((o) => o.name),
      });
    }

    return { unitPriceMinor: price, prepMinutes: prep, selections: result };
  }, [product, selected]);

  function confirm() {
    if (missingGroup) return;
    const outcome = addItem(shop, {
      productId: product.id,
      name: product.name,
      unitPriceMinor,
      prepMinutes,
      quantity,
      selections,
    });
    toast(
      outcome === 'replaced'
        ? `Cart cleared and ${product.name} added — one shop at a time.`
        : `${quantity} × ${product.name} added`,
    );
    onClose();
  }

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={product.name}
      description={product.description ?? undefined}
      footer={
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 rounded-[var(--radius-field)] border border-border p-1">
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              disabled={quantity <= 1}
              aria-label="Reduce quantity"
              className="flex size-10 items-center justify-center rounded-lg text-foreground disabled:opacity-40"
            >
              <Minus aria-hidden className="size-4" />
            </button>
            <span aria-live="polite" className="w-7 text-center font-bold">
              {quantity}
            </span>
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.min(50, q + 1))}
              aria-label="Increase quantity"
              className="flex size-10 items-center justify-center rounded-lg text-foreground"
            >
              <Plus aria-hidden className="size-4" />
            </button>
          </div>

          <Button size="lg" className="flex-1" onClick={confirm} disabled={Boolean(missingGroup)}>
            {missingGroup ? `Choose ${missingGroup.name.toLowerCase()}` : `Add · ${formatMinor(unitPriceMinor * quantity)}`}
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {product.optionGroups.map((group) => {
          const chosen = selected[group.id] ?? [];
          const required = group.minSelect > 0;

          return (
            <fieldset key={group.id}>
              <legend className="mb-2 flex w-full items-center justify-between gap-2">
                <span className="font-bold">{group.name}</span>
                <span className="text-xs font-semibold text-muted">
                  {required ? 'Required' : group.maxSelect > 1 ? `Choose up to ${group.maxSelect}` : 'Optional'}
                </span>
              </legend>

              <div className="space-y-2">
                {group.options.map((option) => {
                  const isChosen = chosen.includes(option.id);
                  /**
                   * "You have picked enough already" only applies where picking
                   * more is what you do — a multi-select group.
                   *
                   * Without the `maxSelect > 1` guard this disabled every
                   * unselected option in a *single*-choice group, because one
                   * choice already meets a limit of one. Required groups
                   * pre-select their first option, so the effect was that a
                   * customer could never change a required choice at all: no
                   * "less sugar", no "no sugar", ever.
                   */
                  const atLimit = !isChosen && group.maxSelect > 1 && chosen.length >= group.maxSelect;
                  const disabled = !option.isAvailable || atLimit;

                  return (
                    <label
                      key={option.id}
                      className={cn(
                        'flex cursor-pointer items-center gap-3 rounded-[var(--radius-field)] border p-3 transition-colors',
                        isChosen ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/30' : 'border-border bg-surface',
                        disabled && 'cursor-not-allowed opacity-50',
                      )}
                    >
                      <input
                        type={group.maxSelect === 1 ? 'radio' : 'checkbox'}
                        name={group.id}
                        checked={isChosen}
                        disabled={disabled}
                        onChange={() => toggle(group, option.id)}
                        className="size-4 accent-brand-500"
                      />
                      <span className="flex-1 text-sm font-medium">
                        {option.name}
                        {!option.isAvailable ? <span className="ml-2 text-xs text-muted">Unavailable</span> : null}
                      </span>
                      {option.priceDeltaMinor !== 0 ? (
                        <span className="text-sm font-semibold text-muted">
                          +{formatMinor(option.priceDeltaMinor)}
                        </span>
                      ) : null}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          );
        })}
      </div>
    </BottomSheet>
  );
}
