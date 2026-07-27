import type { OrderStatus } from '@prisma/client';

/**
 * The order lifecycle, as a state machine.
 *
 * Every status change in the application goes through `assertTransition`. That
 * is what makes "never allow invalid order state transitions" a property of the
 * system rather than a thing each route remembers to check — two staff members
 * tapping "Mark ready" at once cannot double-advance an order, and a customer
 * cannot cancel an order that is already in the customer's hand.
 */

export const TERMINAL_STATUSES: OrderStatus[] = ['PICKED_UP', 'REJECTED', 'CANCELLED', 'EXPIRED'];

/** Orders occupying the kitchen — these are what create queue delay. */
export const ACTIVE_STATUSES: OrderStatus[] = ['PLACED', 'ACCEPTED', 'PREPARING'];

/** Orders still open from the customer's point of view (READY is not collected yet). */
export const OPEN_STATUSES: OrderStatus[] = ['PLACED', 'ACCEPTED', 'PREPARING', 'READY'];

const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PLACED: ['ACCEPTED', 'REJECTED', 'CANCELLED', 'EXPIRED'],
  // A shop may go straight from ACCEPTED to READY for something already made.
  ACCEPTED: ['PREPARING', 'READY', 'CANCELLED', 'EXPIRED'],
  PREPARING: ['READY', 'CANCELLED'],
  READY: ['PICKED_UP', 'EXPIRED'],
  PICKED_UP: [],
  REJECTED: [],
  CANCELLED: [],
  EXPIRED: [],
};

/** Who is allowed to make each move. */
type Actor = 'CUSTOMER' | 'SHOP' | 'SYSTEM';

const ALLOWED_ACTORS: Partial<Record<`${OrderStatus}->${OrderStatus}`, Actor[]>> = {
  'PLACED->ACCEPTED': ['SHOP'],
  'PLACED->REJECTED': ['SHOP'],
  'PLACED->CANCELLED': ['CUSTOMER', 'SHOP'],
  'PLACED->EXPIRED': ['SYSTEM'],
  'ACCEPTED->PREPARING': ['SHOP'],
  'ACCEPTED->READY': ['SHOP'],
  // Once the shop has committed, only the shop can cancel — a customer
  // cancelling here would leave prepared food unpaid for.
  'ACCEPTED->CANCELLED': ['SHOP'],
  'ACCEPTED->EXPIRED': ['SYSTEM'],
  'PREPARING->READY': ['SHOP'],
  'PREPARING->CANCELLED': ['SHOP'],
  'READY->PICKED_UP': ['SHOP'],
  'READY->EXPIRED': ['SYSTEM'],
};

export class InvalidTransitionError extends Error {
  constructor(
    readonly from: OrderStatus,
    readonly to: OrderStatus,
    message: string,
  ) {
    super(message);
    this.name = 'InvalidTransitionError';
  }
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: OrderStatus, to: OrderStatus, actor: Actor): void {
  if (from === to) {
    throw new InvalidTransitionError(from, to, `This order is already ${humanStatus(to).toLowerCase()}.`);
  }
  if (!canTransition(from, to)) {
    throw new InvalidTransitionError(
      from,
      to,
      `An order that is ${humanStatus(from).toLowerCase()} cannot become ${humanStatus(to).toLowerCase()}.`,
    );
  }

  const actors = ALLOWED_ACTORS[`${from}->${to}`];
  if (actors && !actors.includes(actor)) {
    throw new InvalidTransitionError(from, to, 'You are not allowed to make that change to this order.');
  }
}

/**
 * Whether a *customer* may cancel right now (section 23).
 *
 * The rule is deliberately conservative and explained to the customer up front:
 * cancel freely before the shop commits, not after ingredients are used.
 */
export function customerCancellation(status: OrderStatus): { allowed: boolean; reason: string } {
  if (status === 'PLACED') {
    return { allowed: true, reason: 'The shop has not started your order yet, so you can cancel free of charge.' };
  }
  if (status === 'ACCEPTED' || status === 'PREPARING') {
    return {
      allowed: false,
      reason: 'The shop has already started preparing this order. Call the shop if you cannot collect it.',
    };
  }
  if (status === 'READY') {
    return { allowed: false, reason: 'This order is ready and waiting for you at the counter.' };
  }
  return { allowed: false, reason: 'This order is already closed.' };
}

export function humanStatus(status: OrderStatus): string {
  const labels: Record<OrderStatus, string> = {
    PLACED: 'Placed',
    ACCEPTED: 'Accepted',
    PREPARING: 'Preparing',
    READY: 'Ready',
    PICKED_UP: 'Picked up',
    REJECTED: 'Rejected',
    CANCELLED: 'Cancelled',
    EXPIRED: 'Expired',
  };
  return labels[status];
}

/** The five steps shown in the customer's tracker, in order. */
export const TRACKER_STEPS = [
  { status: 'PLACED' as const, label: 'Order placed', done: 'Order placed' },
  { status: 'ACCEPTED' as const, label: 'Shop accepts your order', done: 'Shop accepted your order' },
  { status: 'PREPARING' as const, label: 'Preparing your order', done: 'Your order was prepared' },
  { status: 'READY' as const, label: 'Ready for pickup', done: 'Ready for pickup' },
  { status: 'PICKED_UP' as const, label: 'Picked up', done: 'Picked up' },
];

const STEP_ORDER: OrderStatus[] = ['PLACED', 'ACCEPTED', 'PREPARING', 'READY', 'PICKED_UP'];

export function trackerProgress(status: OrderStatus): number {
  const index = STEP_ORDER.indexOf(status);
  // A shop that skips PREPARING should still show that step as complete once
  // the order is READY, so progress is index-based rather than event-based.
  return index === -1 ? 0 : index;
}
