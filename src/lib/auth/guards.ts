import 'server-only';
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
 */
export async function getCurrentUser(): Promise<AuthedUser | null> {
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
}

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

  const shop = await db.shop.findUnique({ where: { id: shopId } });
  if (!shop) throw new AuthorizationError('Shop not found.', 403);

  if (caller.role === 'ADMIN') {
    return { user: caller, shop, merchant: null };
  }

  if (caller.role === 'MERCHANT') {
    const merchant = await db.merchant.findUnique({ where: { userId: caller.id } });
    if (merchant && merchant.id === shop.merchantId) {
      return { user: caller, shop, merchant };
    }
  }

  if (caller.role === 'STAFF') {
    const membership = await db.shopStaff.findUnique({
      where: { shopId_userId: { shopId, userId: caller.id } },
    });
    if (membership) return { user: caller, shop, merchant: null };
  }

  throw new AuthorizationError('You do not have access to this shop.', 403);
}

/** Every shop the caller may operate, newest first. */
export async function listAccessibleShops(user: AuthedUser): Promise<Shop[]> {
  if (user.role === 'ADMIN') {
    return db.shop.findMany({ orderBy: { createdAt: 'desc' } });
  }
  if (user.role === 'MERCHANT') {
    const merchant = await db.merchant.findUnique({ where: { userId: user.id } });
    if (!merchant) return [];
    return db.shop.findMany({ where: { merchantId: merchant.id }, orderBy: { createdAt: 'desc' } });
  }
  if (user.role === 'STAFF') {
    const memberships = await db.shopStaff.findMany({
      where: { userId: user.id },
      include: { shop: true },
    });
    return memberships.map((m) => m.shop);
  }
  return [];
}
