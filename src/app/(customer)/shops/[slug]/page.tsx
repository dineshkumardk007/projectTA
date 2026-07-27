import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Clock, MapPin, Phone } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth/guards';
import { getShopBySlug } from '@/lib/services/shops';
import { ImageOrPlaceholder } from '@/components/ui/generated-image';
import { Card } from '@/components/ui/primitives';
import { PreparationTimeBadge, ShopStatusBadge } from '@/components/shop/badges';
import { ShopMenu } from '@/components/customer/shop-menu';
import { FavoriteButton } from '@/components/customer/favorite-button';
import { ShopDistance } from '@/components/customer/shop-distance';
import { formatMinutesOfDay } from '@/lib/domain/shop-availability';

export const dynamic = 'force-dynamic';

type Params = Promise<{ slug: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const result = await getShopBySlug(slug);
  if (!result) return { title: 'Shop not found' };
  return {
    title: result.shop.name,
    description: result.shop.description ?? result.shop.tagline ?? undefined,
  };
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** A 00:00–24:00 window means "always open", not "midnight to midnight". */
function describeToday(today?: { dayOfWeek: number; opensAt: number; closesAt: number; isClosed: boolean }): string {
  if (!today || today.isClosed) return 'Closed today';
  if (today.opensAt === 0 && today.closesAt >= 1440) return 'Open 24 hours';
  return `${DAY_NAMES[today.dayOfWeek]} ${formatMinutesOfDay(today.opensAt)} – ${formatMinutesOfDay(today.closesAt)}`;
}

export default async function ShopPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}) {
  const { slug } = await params;
  const search = await searchParams;
  const user = await getCurrentUser();
  const result = await getShopBySlug(slug, user?.id);

  if (!result) notFound();

  const { shop, orderability, estimate, isFavorite, todayForShop } = result;
  const highlightProductId = typeof search.item === 'string' ? search.item : undefined;
  const today = shop.operatingHours.find((h) => h.dayOfWeek === new Date().getDay());

  return (
    <div className="-mx-4 -mt-4">
      <div className="relative">
        <ImageOrPlaceholder
          src={shop.coverImageUrl}
          alt=""
          seed={shop.slug}
          emoji={shop.category.emoji}
          rounded="none"
          className="h-44 w-full sm:h-56"
        />
        <div className="absolute right-3 top-3">
          <FavoriteButton shopId={shop.id} initial={isFavorite} signedIn={Boolean(user)} />
        </div>
      </div>

      <div className="px-4">
        <Card className="-mt-8 relative p-4">
          <div className="flex items-start gap-3">
            <ImageOrPlaceholder
              src={shop.logoImageUrl}
              alt=""
              seed={`${shop.slug}-logo`}
              emoji={shop.category.emoji}
              rounded="field"
              className="size-14 shrink-0"
            />
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-extrabold leading-tight">{shop.name}</h1>
              <p className="mt-0.5 truncate text-sm text-muted">
                {shop.tags.length > 0 ? shop.tags.join(' • ') : shop.category.name}
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <ShopStatusBadge orderability={orderability} />
            {orderability.canOrder ? (
              <PreparationTimeBadge rangeLow={estimate.rangeLow} rangeHigh={estimate.rangeHigh} emphasis="strong" />
            ) : null}
          </div>

          {!orderability.canOrder && orderability.reason ? (
            <p
              role="status"
              className="mt-3 rounded-[var(--radius-field)] bg-warning-50 px-3 py-2.5 text-sm font-medium text-warning-700 dark:bg-warning-500/15 dark:text-warning-100"
            >
              {orderability.reason}
            </p>
          ) : null}

          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex gap-2.5">
              <dt className="sr-only">Address</dt>
              <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
              <dd className="text-muted">
                {shop.addressLine}, {shop.city}
                <ShopDistance latitude={shop.latitude} longitude={shop.longitude} />
              </dd>
            </div>
            <div className="flex gap-2.5">
              <dt className="sr-only">Opening hours today</dt>
              <Clock aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
              <dd className="text-muted">{describeToday(today)}</dd>
            </div>
            <div className="flex gap-2.5">
              <dt className="sr-only">Phone</dt>
              <Phone aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
              <dd>
                <a href={`tel:${shop.phone}`} className="text-brand-600 hover:underline">
                  {shop.phone}
                </a>
              </dd>
            </div>
          </dl>

          {shop.description ? <p className="mt-4 text-sm text-muted">{shop.description}</p> : null}
        </Card>

        <div className="mt-5">
          <ShopMenu
            highlightProductId={highlightProductId}
            shop={{
              id: shop.id,
              slug: shop.slug,
              name: shop.name,
              emoji: shop.category.emoji,
              canOrder: orderability.canOrder,
              closedReason: orderability.reason,
            }}
            sections={shop.menuCategories.map((c) => ({ id: c.id, name: c.name }))}
            products={shop.products.map((product) => ({
              id: product.id,
              name: product.name,
              description: product.description,
              imageUrl: product.imageUrl,
              priceMinor: product.priceMinor,
              prepMinutes: product.prepMinutes,
              unitLabel: product.unitLabel,
              availability: product.availability,
              isPopular: product.isPopular,
              // Resolved against the shop's own local date, so a flag left on
              // from yesterday simply stops matching.
              isTodaysSpecial: product.specialOn === todayForShop,
              specialNote: product.specialNote,
              menuCategoryId: product.menuCategoryId,
              optionGroups: product.optionGroups.map((group) => ({
                id: group.id,
                name: group.name,
                minSelect: group.minSelect,
                maxSelect: group.maxSelect,
                options: group.options.map((option) => ({
                  id: option.id,
                  name: option.name,
                  priceDeltaMinor: option.priceDeltaMinor,
                  prepDeltaMinutes: option.prepDeltaMinutes,
                  isAvailable: option.isAvailable,
                })),
              })),
            }))}
          />
        </div>
      </div>
    </div>
  );
}
