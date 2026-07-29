import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import type { Merchant, Shop, User, UserRole } from '@prisma/client';
import { db } from '@/lib/db';
import { readSessionCookie } from '@/lib/auth/session';

/**
 * Server-side authorisation. Every privileged read/write in the app goes
 * through one of these — a route being hard to reach from the UI is not access
 * control.
 */

export type AuthedUser = Pick<User, 'id' | 'name' | 'email' | 'phone' | 'role' | 'isActive'>;

/**
 * Resolves the caller from the session cookie *and re-checks the database*.
 * The JWT alone is not trusted for authorisation state: a deactivated user or a
 * bumped `tokenVersion` must stop working immediately, not in 30 days.
 *
 * Wrapped in React's `cache` so the layout and the page it wraps share one
 * lookup instead of issuing the same query twice per navigation. The cache is
 * per-request, so the database re-check above still happens on every request —
 * this removes a duplicate round trip, not the security property.
 */
export const getCurrentUser = cache(async function getCurrentUser(): Promise<AuthedUser | null> {
  const claims = await readSessionCookie();
  if (!claims) return null;

  const user = await db.user.findUnique({
    where: { id: claims.sub },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      isActive: true,
      tokenVersion: true,
    },
  });

  if (!user || !user.isActive || user.tokenVersion !== claims.ver) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    isActive: user.isActive,
  };
});

export class AuthorizationError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 403 = 403,
  ) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

/** For API routes: throws instead of redirecting. */
export async function requireUser(roles?: UserRole[]): Promise<AuthedUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthorizationError('You need to sign in to do that.', 401);
  if (roles && !roles.includes(user.role)) {
    throw new AuthorizationError('You do not have access to this.', 403);
  }
  return user;
}

/** For server components: redirects to the right sign-in screen. */
export async function requireUserPage(roles: UserRole[], signInPath: string): Promise<AuthedUser> {
  const user = await getCurrentUser();
  if (!user) redirect(signInPath);
  if (!roles.includes(user.role)) redirect('/');
  return user;
}

export type ShopAccess = {
  user: AuthedUser;
  shop: Shop;
  merchant: Merchant | null;
};

/**
 * The single gate for "may this person act on this shop's orders and menu?".
 *
 * Admins pass for any shop. Merchants pass for shops they own. Staff pass for
 * shops they are assigned to. Everyone else is rejected — this is what stops one
 * merchant reading another merchant's order book.
 */
export async function requireShopAccess(shopId: string, user?: AuthedUser): Promise<ShopAccess> {
  const caller = user ?? (await requireUser());

  /**
   * One query, not two.
   *
   * The shop, its owning merchant and this caller's staff membership are all
   * fetched together. Previously the merchant or membership lookup was a second
   * sequential round trip, which the order board paid on every poll — once every
   * six seconds, per counter device, all day.
   *
   * The staff include is filtered by `userId`, so this never reads the shop's
   * whole staff list to answer a question about one person.
   */
  const record = await db.shop.findUnique({
    where: { id: shopId },
    include: {
      merchant: true,
      staff: { where: { userId: caller.id }, select: { id: true }, take: 1 },
    },
  });
  if (!record) throw new AuthorizationError('Shop not found.', 403);

  // Separated so `shop` stays a plain `Shop`, exactly as callers expect.
  const { merchant, staff, ...shop } = record;

  if (caller.role === 'ADMIN') {
    return { user: caller, shop, merchant: null };
  }

  // Same rule as before, asked from the other direction: does this shop's
  // merchant belong to the caller, rather than does the caller's merchant own
  // this shop. Identical outcome, one fewer trip to the database.
  if (caller.role === 'MERCHANT' && merchant.userId === caller.id) {
    return { user: caller, shop, merchant };
  }

  if (caller.role === 'STAFF' && staff.length > 0) {
    return { user: caller, shop, merchant: null };
  }

  throw new AuthorizationError('You do not have access to this shop.', 403);
}

/**
 * Every shop the caller may operate, newest first.
 *
 * Each branch is a single query. The merchant branch used to look up the
 * merchant row and then its shops in sequence; expressed as a relation filter
 * it is one trip, and a merchant with no record simply returns nothing — which
 * is what the explicit guard did anyway. Every merchant screen loads through
 * here, so this sits on the critical path of the whole dashboard.
 */
export async function listAccessibleShops(user: AuthedUser): Promise<Shop[]> {
  if (user.role === 'ADMIN') {
    return db.shop.findMany({ orderBy: { createdAt: 'desc' } });
  }
  if (user.role === 'MERCHANT') {
    return db.shop.findMany({ where: { merchant: { userId: user.id } }, orderBy: { createdAt: 'desc' } });
  }
  if (user.role === 'STAFF') {
    // Ordered like the others, which the membership-join version was not.
    return db.shop.findMany({
      where: { staff: { some: { userId: user.id } } },
      orderBy: { createdAt: 'desc' },
    });
  }
  return [];
}
