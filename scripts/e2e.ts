/**
 * End-to-end workflow test.
 *
 * Drives the real HTTP API against a running dev server and a seeded database —
 * no mocks, no stubs. It covers the critical path (customer orders → merchant
 * prepares → QR pickup) plus the edge cases from section 57 that are easy to
 * get wrong and expensive to get wrong in production.
 *
 * Usage:
 *   1. pnpm db:local      (in one terminal)
 *   2. pnpm dev           (in another)
 *   3. pnpm db:reset      (fresh seed data)
 *   4. pnpm test:e2e
 */

import fs from 'node:fs';
import path from 'node:path';

// This runs outside Next, which is what loads `.env` in the app. Read it here so
// DATABASE_URL and AUTH_SECRET are available without adding a dependency.
for (const line of fs.existsSync('.env') ? fs.readFileSync(path.resolve('.env'), 'utf8').split('\n') : []) {
  const match = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n\r]*)"?\s*$/.exec(line);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const PASSWORD = 'takeaway123';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail?: unknown) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    failures.push(name);
    console.log(`  ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`);
  }
}

function section(title: string) {
  console.log(`\n${title}`);
}

/**
 * A cookie-jar-backed fetch, so each actor keeps their own session.
 *
 * A 429 is retried once after the window resets. A single run stays well inside
 * the sign-in and order limits; running the whole suite twice inside a minute
 * does not, and waiting it out is the right response — weakening a control that
 * exists to stop credential stuffing and order spam would be the wrong one.
 * No assertion here expects a 429, so nothing is masked by this.
 */
function createClient() {
  const cookies = new Map<string, string>();

  return async function request(
    path: string,
    init: RequestInit & { json?: unknown } = {},
    isRetry = false,
  ): Promise<{ status: number; body: Record<string, unknown> }> {
    const headers = new Headers(init.headers);
    if (init.json !== undefined) {
      headers.set('content-type', 'application/json');
    }
    if (cookies.size > 0) {
      headers.set('cookie', [...cookies].map(([k, v]) => `${k}=${v}`).join('; '));
    }

    const response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers,
      body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
      redirect: 'manual',
    });

    for (const raw of response.headers.getSetCookie?.() ?? []) {
      const [pair] = raw.split(';');
      const index = pair.indexOf('=');
      if (index > 0) cookies.set(pair.slice(0, index), pair.slice(index + 1));
    }

    const text = await response.text();
    let body: Record<string, unknown> = {};
    try {
      body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      body = { raw: text.slice(0, 200) };
    }

    if (response.status === 429 && !isRetry) {
      const seconds = Number(/(\d+)s/.exec(String(body.error ?? ''))?.[1] ?? 60);
      console.log(`  … rate limited, waiting ${seconds + 1}s for the window to reset`);
      await new Promise((resolve) => setTimeout(resolve, (seconds + 1) * 1000));
      return request(path, init, true);
    }

    return { status: response.status, body };
  };
}

async function signIn(client: ReturnType<typeof createClient>, email: string) {
  const result = await client('/api/auth/login', { method: 'POST', json: { email, password: PASSWORD } });
  if (result.status !== 200) throw new Error(`Could not sign in as ${email}: ${JSON.stringify(result.body)}`);
  return result.body as { id: string; role: string };
}

async function main() {
  console.log(`Running end-to-end workflow tests against ${BASE_URL}\n`);

  // Fail fast with a useful message rather than a wall of fetch errors.
  try {
    await fetch(`${BASE_URL}/api/shops/health-probe/favorite`, { method: 'DELETE' });
  } catch {
    console.error(`Cannot reach ${BASE_URL}. Start the dev server with \`pnpm dev\` first.`);
    process.exit(1);
  }

  const customer = createClient();
  const merchant = createClient();
  const admin = createClient();
  const stranger = createClient();

  // ---------------------------------------------------------------- auth ---
  section('Authentication and roles');
  const customerUser = await signIn(customer, 'priya@takeaway.test');
  check('Customer can sign in', customerUser.role === 'CUSTOMER');

  const merchantUser = await signIn(merchant, 'lakshmi@takeaway.test');
  check('Merchant can sign in', merchantUser.role === 'MERCHANT');

  const adminUser = await signIn(admin, 'admin@takeaway.test');
  check('Admin can sign in', adminUser.role === 'ADMIN');

  await signIn(stranger, 'rahul@takeaway.test');

  const badLogin = await customer('/api/auth/login', {
    method: 'POST',
    json: { email: 'priya@takeaway.test', password: 'not-the-password' },
  });
  check('Wrong password is rejected', badLogin.status === 401, badLogin.body);

  const anonymous = createClient();
  const anonymousOrder = await anonymous('/api/orders', {
    method: 'POST',
    json: { shopId: 'x', items: [{ productId: 'x', quantity: 1, selections: [] }], paymentMethod: 'CASH_ON_PICKUP' },
  });
  check('Anonymous users cannot place orders', anonymousOrder.status === 401, anonymousOrder.body);

  // --------------------------------------------------------------- setup ---
  section('Shop and menu discovery');
  const { PrismaClient } = await import('@prisma/client');
  const db = new PrismaClient();

  const shop = await db.shop.findUniqueOrThrow({
    where: { slug: 'sri-kumar-tea-stall' },
    include: { products: { include: { optionGroups: { include: { options: true } } } } },
  });
  check('Seeded shop is present with a menu', shop.products.length > 0);

  const tea = shop.products.find((p) => p.name === 'Masala Tea')!;
  const coffee = shop.products.find((p) => p.name === 'Filter Coffee')!;
  const samosa = shop.products.find((p) => p.name === 'Samosa')!;
  const sugarGroup = coffee.optionGroups.find((g) => g.name === 'Sugar')!;
  const noSugar = sugarGroup.options.find((o) => o.name === 'No sugar')!;
  const addonGroup = samosa.optionGroups.find((g) => g.name === 'Add-ons')!;
  const extraChutney = addonGroup.options.find((o) => o.name === 'Extra chutney')!;

  // Put the shop into a known state so the suite is repeatable: open, no
  // capacity cap in force, and no orders left in the kitchen by an earlier run
  // (which would otherwise eat into the capacity limit tested at the end).
  await db.order.updateMany({
    where: { shopId: shop.id, status: { in: ['PLACED', 'ACCEPTED', 'PREPARING', 'READY'] } },
    data: { status: 'EXPIRED', closedAt: new Date() },
  });
  await db.shop.update({
    where: { id: shop.id },
    data: { status: 'OPEN', maxActiveOrders: 15 },
  });
  await db.product.updateMany({ where: { shopId: shop.id }, data: { availability: 'AVAILABLE' } });

  // Park the order-code counter above anything already issued today, and put the
  // prefix back in case an earlier run died midway through the daily-reset
  // section. Without this, a rerun reissues codes that today's orders already
  // hold and every order fails — a property of the test, not of the app.
  const localToday = new Intl.DateTimeFormat('en-CA', {
    timeZone: shop.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  const issuedToday = await db.order.findMany({
    where: { shopId: shop.id, codeDate: localToday },
    select: { code: true },
  });
  const highestToday = issuedToday.reduce((max, order) => {
    const value = Number(order.code.replace(/^\D+/, ''));
    return Number.isFinite(value) && value > max ? value : max;
  }, 100);

  await db.shop.update({
    where: { id: shop.id },
    data: { orderCodePrefix: 'A', dailySequenceOn: localToday, dailySequence: highestToday },
  });

  // ------------------------------------------------------------- pricing ---
  section('Server-side pricing and validation');
  const quote = await customer('/api/checkout/quote', {
    method: 'POST',
    json: {
      shopId: shop.id,
      items: [
        { productId: tea.id, quantity: 2, selections: [] },
        { productId: coffee.id, quantity: 1, selections: [{ groupId: sugarGroup.id, optionIds: [noSugar.id] }] },
        { productId: samosa.id, quantity: 1, selections: [{ groupId: addonGroup.id, optionIds: [extraChutney.id] }] },
      ],
    },
  });

  const expectedTotal =
    tea.priceMinor * 2 + (coffee.priceMinor + noSugar.priceDeltaMinor) + (samosa.priceMinor + extraChutney.priceDeltaMinor);
  check('Quote prices the cart from the database', quote.body.totalMinor === expectedTotal, {
    got: quote.body.totalMinor,
    expected: expectedTotal,
  });
  check('Quote returns a ready-time estimate', typeof quote.body.estimatedReadyAt === 'string');

  const requiredMissing = await customer('/api/checkout/quote', {
    method: 'POST',
    json: { shopId: shop.id, items: [{ productId: coffee.id, quantity: 1, selections: [] }] },
  });
  check('A required option group must be chosen', requiredMissing.status === 422, requiredMissing.body);

  const tooManyAddons = await customer('/api/checkout/quote', {
    method: 'POST',
    json: {
      shopId: shop.id,
      items: [
        {
          productId: samosa.id,
          quantity: 1,
          selections: [{ groupId: addonGroup.id, optionIds: addonGroup.options.map((o) => o.id).concat(addonGroup.options[0].id) }],
        },
      ],
    },
  });
  check('Choosing more options than allowed is rejected', tooManyAddons.status === 422, tooManyAddons.body);

  const badQuantity = await customer('/api/orders', {
    method: 'POST',
    json: {
      shopId: shop.id,
      items: [{ productId: tea.id, quantity: -5, selections: [] }],
      paymentMethod: 'CASH_ON_PICKUP',
    },
  });
  check('Negative quantities are rejected', badQuantity.status === 422, badQuantity.body);

  // ---------------------------------------------------- unavailable item ---
  section('Unavailable products');
  await db.product.update({ where: { id: tea.id }, data: { availability: 'OUT_OF_STOCK' } });
  const outOfStock = await customer('/api/orders', {
    method: 'POST',
    json: {
      shopId: shop.id,
      items: [{ productId: tea.id, quantity: 1, selections: [] }],
      paymentMethod: 'CASH_ON_PICKUP',
    },
  });
  check('Out-of-stock items cannot be ordered', outOfStock.status === 409, outOfStock.body);
  await db.product.update({ where: { id: tea.id }, data: { availability: 'AVAILABLE' } });

  // ------------------------------------------------------- shop is shut ---
  section('Closed and paused shops');
  await db.shop.update({ where: { id: shop.id }, data: { status: 'PAUSED' } });
  const paused = await customer('/api/orders', {
    method: 'POST',
    json: {
      shopId: shop.id,
      items: [{ productId: tea.id, quantity: 1, selections: [] }],
      paymentMethod: 'CASH_ON_PICKUP',
    },
  });
  check('A paused shop cannot receive orders', paused.status === 409, paused.body);
  await db.shop.update({ where: { id: shop.id }, data: { status: 'OPEN' } });

  // -------------------------------------------------------- happy path ---
  section('Critical path: order → accept → prepare → ready → pickup');
  const placed = await customer('/api/orders', {
    method: 'POST',
    json: {
      shopId: shop.id,
      items: [
        { productId: tea.id, quantity: 2, selections: [] },
        { productId: samosa.id, quantity: 1, selections: [{ groupId: addonGroup.id, optionIds: [extraChutney.id] }] },
      ],
      paymentMethod: 'CASH_ON_PICKUP',
      customerLocation: { latitude: 8.7712, longitude: 78.1408 },
    },
  });
  check('Customer places a pre-order', placed.status === 201, placed.body);

  const orderId = placed.body.id as string;
  const orderCode = placed.body.code as string;
  check('Order gets a human-readable code', /^[A-Z]\d+$/.test(orderCode), orderCode);

  const withEta = await db.order.findUniqueOrThrow({ where: { id: orderId } });
  check('Customer travel ETA is recorded', withEta.customerEtaMinutes != null, withEta.customerEtaMinutes);
  check('Baseline wait is snapshotted for the saved-time metric', withEta.baselineWaitMinutes > 0);

  // Authorisation: another customer must not be able to read this order.
  const peek = await stranger(`/api/orders/${orderId}`);
  check('Another customer cannot read this order', peek.status === 403, peek.body);

  // `merchant` runs Annapoorna Breakfast; `teaMerchant` runs this shop.
  const teaMerchant = createClient();
  await signIn(teaMerchant, 'kumar@takeaway.test');

  const crossShop = await merchant(`/api/merchant/orders/${orderId}/transition`, {
    method: 'POST',
    json: { to: 'ACCEPTED' },
  });
  check('A merchant cannot act on another shop’s order', crossShop.status === 403, crossShop.body);

  // Invalid transitions, checked as the merchant who *does* own this shop so a
  // 409 proves the state machine refused it rather than authorisation.
  const skipAhead = await teaMerchant(`/api/merchant/orders/${orderId}/transition`, {
    method: 'POST',
    json: { to: 'PICKED_UP' },
  });
  check('Cannot jump straight from placed to picked up', skipAhead.status === 409, skipAhead.body);

  const accept = await teaMerchant(`/api/merchant/orders/${orderId}/transition`, {
    method: 'POST',
    json: { to: 'ACCEPTED' },
  });
  check('Merchant accepts the order', accept.status === 200, accept.body);

  const doubleAccept = await teaMerchant(`/api/merchant/orders/${orderId}/transition`, {
    method: 'POST',
    json: { to: 'ACCEPTED' },
  });
  check('Accepting twice is refused (concurrent taps)', doubleAccept.status === 409, doubleAccept.body);

  const lateCancel = await customer(`/api/orders/${orderId}/cancel`, { method: 'POST' });
  check('Customer cannot cancel after the shop commits', lateCancel.status === 409, lateCancel.body);

  const prepare = await teaMerchant(`/api/merchant/orders/${orderId}/transition`, {
    method: 'POST',
    json: { to: 'PREPARING' },
  });
  check('Merchant starts preparing', prepare.status === 200, prepare.body);

  const delay = await teaMerchant(`/api/merchant/orders/${orderId}/delay`, {
    method: 'POST',
    json: { extraMinutes: 8 },
  });
  check('Merchant can report a delay', delay.status === 200, delay.body);

  const afterDelay = await db.order.findUniqueOrThrow({ where: { id: orderId } });
  check('Delay pushes back the promised ready time', afterDelay.promisedPrepMinutes >= 8);
  const delayNotice = await db.notification.findFirst({ where: { orderId, type: 'ORDER_DELAYED' } });
  check('Customer is told about the delay', delayNotice != null);

  const ready = await teaMerchant(`/api/merchant/orders/${orderId}/transition`, {
    method: 'POST',
    json: { to: 'READY' },
  });
  check('Merchant marks the order ready', ready.status === 200, ready.body);

  const readyNotice = await db.notification.findFirst({ where: { orderId, type: 'ORDER_READY' } });
  check('Customer is notified the order is ready', readyNotice != null);

  // ------------------------------------------------------------- pickup ---
  section('Pickup verification');
  const orderRecord = await db.order.findUniqueOrThrow({ where: { id: orderId } });

  const wrongShopLookup = await merchant('/api/merchant/pickup/verify', {
    method: 'POST',
    json: { shopId: shop.id, code: orderCode },
  });
  check('Staff of another shop cannot look up this order', wrongShopLookup.status === 403, wrongShopLookup.body);

  const byCode = await teaMerchant('/api/merchant/pickup/verify', {
    method: 'POST',
    json: { shopId: shop.id, code: orderCode },
  });
  check('Order-number fallback finds the order', byCode.status === 200, byCode.body);
  check(
    'Order is reported as collectable',
    (byCode.body.order as { collectable: boolean } | undefined)?.collectable === true,
  );

  const byPickupCode = await teaMerchant('/api/merchant/pickup/verify', {
    method: 'POST',
    json: { shopId: shop.id, pickupCode: orderRecord.pickupCode },
  });
  check('Pickup-code fallback finds the order', byPickupCode.status === 200, byPickupCode.body);

  // Built here rather than imported from the app: `src/lib/services/pickup.ts`
  // is `server-only` and cannot load outside Next. Constructing the token
  // independently also makes this a genuine black-box check of the server's
  // signature verification.
  const crypto = await import('node:crypto');
  const signToken = (id: string, pickupCode: string) => {
    const payload = `v1.${id}.${pickupCode}`;
    const signature = crypto
      .createHmac('sha256', process.env.AUTH_SECRET!)
      .update(payload)
      .digest('base64url')
      .slice(0, 32);
    return `${payload}.${signature}`;
  };
  const token = signToken(orderId, orderRecord.pickupCode);
  const byQr = await teaMerchant('/api/merchant/pickup/verify', {
    method: 'POST',
    json: { shopId: shop.id, token },
  });
  check('Signed QR token verifies', byQr.status === 200, byQr.body);

  const forged = await teaMerchant('/api/merchant/pickup/verify', {
    method: 'POST',
    json: { shopId: shop.id, token: `v1.${orderId}.${orderRecord.pickupCode}.deadbeefdeadbeefdeadbeefdeadbeef` },
  });
  check('A forged QR token is rejected', forged.status === 422, forged.body);

  const unknownCode = await teaMerchant('/api/merchant/pickup/verify', {
    method: 'POST',
    json: { shopId: shop.id, code: 'Z999' },
  });
  check('An unknown order number is reported cleanly', unknownCode.status === 404, unknownCode.body);

  const collect = await teaMerchant(`/api/merchant/orders/${orderId}/transition`, {
    method: 'POST',
    json: { to: 'PICKED_UP', verificationMethod: 'QR' },
  });
  check('Merchant confirms pickup', collect.status === 200, collect.body);

  const collectAgain = await teaMerchant(`/api/merchant/orders/${orderId}/transition`, {
    method: 'POST',
    json: { to: 'PICKED_UP' },
  });
  check('An already-collected order cannot be collected twice', collectAgain.status === 409, collectAgain.body);

  const finished = await db.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { statusEvents: true },
  });
  check('Order is marked picked up', finished.status === 'PICKED_UP');
  check('Cash order is marked paid at pickup', finished.paymentStatus === 'PAID');
  check('Waiting time saved is recorded', (finished.waitMinutesSaved ?? 0) > 0, finished.waitMinutesSaved);
  check('Actual preparation time is measured', finished.actualPrepMinutes != null);
  check('Full audit trail is written', finished.statusEvents.length >= 5, finished.statusEvents.length);

  // ------------------------------------------------------ cancellation ---
  section('Cancellation before the shop commits');
  const cancellable = await customer('/api/orders', {
    method: 'POST',
    json: {
      shopId: shop.id,
      items: [{ productId: tea.id, quantity: 1, selections: [] }],
      paymentMethod: 'CASH_ON_PICKUP',
    },
  });
  const cancelId = cancellable.body.id as string;
  const cancel = await customer(`/api/orders/${cancelId}/cancel`, { method: 'POST' });
  check('Customer can cancel before acceptance', cancel.status === 200, cancel.body);

  const strangerCancel = await stranger(`/api/orders/${orderId}/cancel`, { method: 'POST' });
  check('Another customer cannot cancel your order', strangerCancel.status === 403, strangerCancel.body);

  // ----------------------------------------------------------- rejection ---
  section('Merchant rejection');
  const toReject = await customer('/api/orders', {
    method: 'POST',
    json: {
      shopId: shop.id,
      items: [{ productId: tea.id, quantity: 1, selections: [] }],
      paymentMethod: 'CASH_ON_PICKUP',
    },
  });
  const rejectId = toReject.body.id as string;
  const reject = await teaMerchant(`/api/merchant/orders/${rejectId}/transition`, {
    method: 'POST',
    json: { to: 'REJECTED', note: 'We have run out of these items' },
  });
  check('Merchant can reject an order', reject.status === 200, reject.body);
  const rejectNotice = await db.notification.findFirst({ where: { orderId: rejectId, type: 'ORDER_REJECTED' } });
  check('Customer is told the order was rejected', rejectNotice != null);

  // ------------------------------------------------------ online payment ---
  section('Online payment and refund');
  const onlineOrder = await customer('/api/orders', {
    method: 'POST',
    json: {
      shopId: shop.id,
      items: [{ productId: tea.id, quantity: 1, selections: [] }],
      paymentMethod: 'ONLINE',
    },
  });
  const payId = onlineOrder.body.id as string;
  check('Online order starts unpaid', onlineOrder.body.paymentStatus === 'PENDING', onlineOrder.body);

  const acceptUnpaid = await teaMerchant(`/api/merchant/orders/${payId}/transition`, {
    method: 'POST',
    json: { to: 'ACCEPTED' },
  });
  check('An unpaid online order cannot be accepted', acceptUnpaid.status === 409, acceptUnpaid.body);

  const intent = await customer(`/api/orders/${payId}/pay`, { method: 'POST' });
  check('Payment intent is created', intent.status === 200, intent.body);

  const badSignature = await customer(`/api/orders/${payId}/pay`, {
    method: 'PUT',
    json: { reference: intent.body.reference, signature: 'forged-signature' },
  });
  check('An unsigned payment confirmation is refused', badSignature.status === 402, badSignature.body);

  const retryIntent = await customer(`/api/orders/${payId}/pay`, { method: 'POST' });
  const goodSignature = await customer(`/api/orders/${payId}/pay`, {
    method: 'PUT',
    json: {
      reference: retryIntent.body.reference,
      signature: (retryIntent.body.clientPayload as { signature: string }).signature,
    },
  });
  check('A correctly signed payment is accepted', goodSignature.status === 200, goodSignature.body);

  const duplicatePay = await customer(`/api/orders/${payId}/pay`, {
    method: 'PUT',
    json: {
      reference: retryIntent.body.reference,
      signature: (retryIntent.body.clientPayload as { signature: string }).signature,
    },
  });
  check('Duplicate payment confirmation does not double-charge', duplicatePay.body.alreadyPaid === true, duplicatePay.body);

  const cancelPaid = await teaMerchant(`/api/merchant/orders/${payId}/transition`, {
    method: 'POST',
    json: { to: 'REJECTED', note: 'Kitchen closed' },
  });
  check('Merchant can reject a paid order', cancelPaid.status === 200, cancelPaid.body);

  const refunded = await db.order.findUniqueOrThrow({ where: { id: payId } });
  check('Rejecting a paid order refunds it automatically', refunded.paymentStatus === 'REFUNDED', refunded.paymentStatus);

  // -------------------------------------------------------------- admin ---
  section('Admin authorisation');
  const customerHitsAdmin = await customer('/api/admin/settings', {
    method: 'PUT',
    json: { key: 'commission.percent', value: 99 },
  });
  check('Customers cannot change platform settings', customerHitsAdmin.status === 403, customerHitsAdmin.body);

  const merchantHitsAdmin = await teaMerchant('/api/admin/users/anything', {
    method: 'PATCH',
    json: { isActive: false },
  });
  check('Merchants cannot deactivate users', merchantHitsAdmin.status === 403, merchantHitsAdmin.body);

  // Reset the demo merchant to PENDING so this suite is repeatable without a
  // re-seed — a previous run will have verified them.
  const pendingUser = await db.user.findUniqueOrThrow({ where: { email: 'pending@takeaway.test' } });
  const pendingMerchant = await db.merchant.update({
    where: { userId: pendingUser.id },
    data: { verificationStatus: 'PENDING', verifiedAt: null },
  });

  const verify = await admin(`/api/admin/merchants/${pendingMerchant.id}`, {
    method: 'PATCH',
    json: { verificationStatus: 'VERIFIED' },
  });
  check('Admin can verify a merchant', verify.status === 200, verify.body);

  const selfDeactivate = await admin(`/api/admin/users/${adminUser.id}`, {
    method: 'PATCH',
    json: { isActive: false },
  });
  check('Admin cannot deactivate themselves', selfDeactivate.status === 409, selfDeactivate.body);

  // ------------------------------------------------ daily code reset ---
  section('Daily order-code reset');
  //
  // Order codes restart at 101 every day, so the *same* code legitimately recurs
  // on consecutive days. If uniqueness were scoped to [shopId, code] rather than
  // [shopId, codeDate, code], every shop would be unable to trade from the
  // moment its counter reset until it climbed past yesterday's highest number —
  // a daily outage.
  //
  // Simulated by issuing a code, back-dating that order to yesterday, then
  // rewinding the counter so the very same code is issued again today. An
  // unused prefix keeps this clear of real order history.
  // Clear the probe orders a previous run left behind, so the same simulated
  // codes are free to be issued again.
  await db.order.deleteMany({ where: { shopId: shop.id, code: { startsWith: 'Z' } } });

  await db.shop.update({
    where: { id: shop.id },
    data: { orderCodePrefix: 'Z', dailySequenceOn: '1999-01-01', dailySequence: 100 },
  });

  const yesterdayOrder = await customer('/api/orders', {
    method: 'POST',
    json: {
      shopId: shop.id,
      items: [{ productId: tea.id, quantity: 1, selections: [] }],
      paymentMethod: 'CASH_ON_PICKUP',
    },
  });
  check('The code restarts at 101 each day', yesterdayOrder.body.code === 'Z101', yesterdayOrder.body);

  const firstCodeDate = (
    await db.order.findFirstOrThrow({
      where: { id: yesterdayOrder.body.id as string },
      select: { codeDate: true },
    })
  ).codeDate;
  check('The order records which day its code belongs to', firstCodeDate.length === 10, firstCodeDate);

  // Pretend that order was yesterday's, then roll the counter over again.
  await db.order.update({
    where: { id: yesterdayOrder.body.id as string },
    data: { codeDate: '1999-12-31' },
  });
  await db.shop.update({
    where: { id: shop.id },
    data: { dailySequenceOn: '1999-01-01', dailySequence: 100 },
  });

  const todayOrder = await customer('/api/orders', {
    method: 'POST',
    json: {
      shopId: shop.id,
      items: [{ productId: tea.id, quantity: 1, selections: [] }],
      paymentMethod: 'CASH_ON_PICKUP',
    },
  });
  check('The same code may be reissued on the next day', todayOrder.status === 201, todayOrder.body);
  check('The reissued code is identical', todayOrder.body.code === 'Z101', todayOrder.body.code);

  // Back to the seeded prefix, and past the codes this section just issued.
  await db.shop.update({
    where: { id: shop.id },
    data: { orderCodePrefix: 'A', dailySequenceOn: localToday, dailySequence: highestToday + 50 },
  });

  // ----------------------------------------------- arrival & metric ---
  section('Arrival reporting and the waiting-time metric');

  const metricOrder = await customer('/api/orders', {
    method: 'POST',
    json: {
      shopId: shop.id,
      items: [{ productId: tea.id, quantity: 1, selections: [] }],
      paymentMethod: 'CASH_ON_PICKUP',
    },
  });
  check('Order placed for the metric checks', metricOrder.status === 201, metricOrder.body);
  const metricId = metricOrder.body.id as string;

  const strangerArrival = await stranger(`/api/orders/${metricId}/arrived`, { method: 'POST' });
  check('Another customer cannot report arrival on your order', strangerArrival.status === 403, strangerArrival.body);

  const tooFar = await customer(`/api/orders/${metricId}/arrived`, {
    method: 'POST',
    json: { automatic: true, latitude: 12.9716, longitude: 77.5946 },
  });
  check('Automatic arrival is rejected far from the shop', tooFar.status === 409, tooFar.body);

  const arrived = await customer(`/api/orders/${metricId}/arrived`, { method: 'POST', json: {} });
  check('Customer can report arrival by hand', arrived.status === 200, arrived.body);

  const arrivedAgain = await customer(`/api/orders/${metricId}/arrived`, { method: 'POST', json: {} });
  check('Reporting arrival twice is a no-op', arrivedAgain.body.alreadyRecorded === true, arrivedAgain.body);

  await teaMerchant(`/api/merchant/orders/${metricId}/transition`, { method: 'POST', json: { to: 'ACCEPTED' } });
  await teaMerchant(`/api/merchant/orders/${metricId}/transition`, { method: 'POST', json: { to: 'READY' } });
  await teaMerchant(`/api/merchant/orders/${metricId}/transition`, { method: 'POST', json: { to: 'PICKED_UP' } });

  const measuredOrder = await db.order.findUniqueOrThrow({ where: { id: metricId } });
  check('Arrival time is stored', measuredOrder.customerArrivedAt != null);
  check('Savings from a reported arrival are marked measured', measuredOrder.waitMeasured === true);

  const unmeasured = await db.order.findFirst({
    where: { status: 'PICKED_UP', customerArrivedAt: null },
    select: { waitMeasured: true },
  });
  check('Savings without an arrival are marked estimated', unmeasured?.waitMeasured === false, unmeasured);

  // ------------------------------------------------- metric integrity ---
  section('Metric integrity');
  const merchantInflate = await teaMerchant(`/api/merchant/shops/${shop.id}`, {
    method: 'PATCH',
    json: { baselineWaitMinutes: 180 },
  });
  const afterInflate = await db.shop.findUniqueOrThrow({ where: { id: shop.id } });
  check(
    'A merchant cannot inflate the baseline queue wait',
    merchantInflate.status !== 200 || afterInflate.baselineWaitMinutes !== 180,
    { status: merchantInflate.status, baseline: afterInflate.baselineWaitMinutes },
  );

  const adminBaseline = await admin(`/api/admin/shops/${shop.id}`, {
    method: 'PATCH',
    json: { baselineWaitMinutes: 14 },
  });
  check('An admin can set the baseline queue wait', adminBaseline.body.baselineWaitMinutes === 14, adminBaseline.body);

  // -------------------------------------------------- password reset ---
  section('Password reset');
  const unknownAddress = await anonymous('/api/auth/forgot-password', {
    method: 'POST',
    json: { email: 'nobody-here@takeaway.test' },
  });
  check('Unknown addresses get the same response (no enumeration)', unknownAddress.status === 200, unknownAddress.body);

  const requested = await anonymous('/api/auth/forgot-password', {
    method: 'POST',
    json: { email: 'rahul@takeaway.test' },
  });
  check('Reset can be requested', requested.status === 200, requested.body);

  const tokenRow = await db.passwordResetToken.findFirst({
    where: { user: { email: 'rahul@takeaway.test' }, usedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  check('A reset token is stored hashed, not in the clear', tokenRow != null && tokenRow.tokenHash.length === 64);

  const forgedReset = await anonymous('/api/auth/reset-password', {
    method: 'POST',
    json: { token: 'not-a-real-token', password: 'brand-new-pass' },
  });
  check('A forged reset token is refused', forgedReset.status === 400, forgedReset.body);

  const shortPassword = await anonymous('/api/auth/reset-password', {
    method: 'POST',
    json: { token: 'whatever', password: 'short' },
  });
  check('A too-short new password is refused', shortPassword.status === 422, shortPassword.body);

  // -------------------------------------------- option group editing ---
  section('Menu choices');
  const editableProduct = await db.product.findFirstOrThrow({
    where: { shopId: shop.id, name: 'Vada' },
    select: { id: true },
  });

  const badGroup = await teaMerchant(`/api/merchant/products/${editableProduct.id}/option-groups`, {
    method: 'POST',
    json: { name: 'Broken', minSelect: 2, maxSelect: 1, options: [{ name: 'Only one' }] },
  });
  check('A group whose maximum is below its minimum is refused', badGroup.status === 422, badGroup.body);

  const emptyGroup = await teaMerchant(`/api/merchant/products/${editableProduct.id}/option-groups`, {
    method: 'POST',
    json: { name: 'Empty', minSelect: 0, maxSelect: 1, options: [] },
  });
  check('A group with no choices is refused', emptyGroup.status === 422, emptyGroup.body);

  const createdGroup = await teaMerchant(`/api/merchant/products/${editableProduct.id}/option-groups`, {
    method: 'POST',
    json: {
      name: 'Chutney',
      minSelect: 1,
      maxSelect: 1,
      options: [
        { name: 'Coconut', priceDeltaMinor: 0 },
        { name: 'Tomato', priceDeltaMinor: 500 },
      ],
    },
  });
  check('Merchant can add a choice group', createdGroup.status === 201, createdGroup.body);

  const groupId = createdGroup.body.id as string;
  const foreignEdit = await merchant(`/api/merchant/option-groups/${groupId}`, {
    method: 'PATCH',
    json: { name: 'Hijacked', minSelect: 0, maxSelect: 1, options: [{ name: 'x' }] },
  });
  check('A merchant cannot edit another shop’s choices', foreignEdit.status === 403, foreignEdit.body);

  // The new group is required, so ordering without a choice must now fail.
  const nowRequired = await customer('/api/checkout/quote', {
    method: 'POST',
    json: { shopId: shop.id, items: [{ productId: editableProduct.id, quantity: 1, selections: [] }] },
  });
  check('A newly required choice is enforced at checkout', nowRequired.status === 422, nowRequired.body);

  const deleteGroup = await teaMerchant(`/api/merchant/option-groups/${groupId}`, { method: 'DELETE' });
  check('Merchant can remove a choice group', deleteGroup.status === 200, deleteGroup.body);

  const duplicateSection = await teaMerchant('/api/merchant/menu-sections', {
    method: 'POST',
    json: { shopId: shop.id, name: 'Tea' },
  });
  check('Duplicate menu sections are refused', duplicateSection.status === 409, duplicateSection.body);

  // ----------------------------------------------------- order again ---
  section('Order again');
  const reorderSource = await customer(`/api/orders/${orderId}/reorder`, { method: 'POST' });
  check('A past order can be rebuilt into a cart', reorderSource.status === 200, reorderSource.body);
  check(
    'The rebuilt cart carries the original items',
    Array.isArray(reorderSource.body.items) && (reorderSource.body.items as unknown[]).length > 0,
    reorderSource.body.items,
  );

  const strangerReorder = await stranger(`/api/orders/${orderId}/reorder`, { method: 'POST' });
  check('Another customer cannot rebuild your order', strangerReorder.status === 403, strangerReorder.body);

  // A merchant deleting and re-adding an item orphans OrderItem.productId
  // (onDelete: SetNull). Reorder must fall back to the snapshotted name,
  // otherwise every regular's "order again" breaks the first time a menu is
  // rebuilt.
  await db.orderItem.updateMany({ where: { orderId }, data: { productId: null } });
  const afterMenuRebuild = await customer(`/api/orders/${orderId}/reorder`, { method: 'POST' });
  check(
    'Order again still works after the menu is rebuilt',
    afterMenuRebuild.status === 200,
    afterMenuRebuild.body,
  );
  check(
    'Nothing was silently dropped on the rebuilt menu',
    Array.isArray(afterMenuRebuild.body.skipped) && (afterMenuRebuild.body.skipped as unknown[]).length === 0,
    afterMenuRebuild.body.skipped,
  );

  // -------------------------------------------------- today's special ---
  section("Today's special");
  const specialProduct = await db.product.findFirstOrThrow({
    where: { shopId: shop.id, name: 'Ginger Tea' },
    select: { id: true },
  });

  const setSpecial = await teaMerchant(`/api/merchant/products/${specialProduct.id}`, {
    method: 'PATCH',
    json: { isTodaysSpecial: true, specialNote: 'Extra ginger today' },
  });
  check('Merchant can flag an item as today’s special', setSpecial.body.isTodaysSpecial === true, setSpecial.body);

  const flagged = await db.product.findUniqueOrThrow({ where: { id: specialProduct.id } });
  check(
    'The flag is stored as the shop-local date, so it expires by itself',
    /^\d{4}-\d{2}-\d{2}$/.test(flagged.specialOn),
    flagged.specialOn,
  );

  const foreignSpecial = await merchant(`/api/merchant/products/${specialProduct.id}`, {
    method: 'PATCH',
    json: { isTodaysSpecial: false },
  });
  check('A merchant cannot change another shop’s specials', foreignSpecial.status === 403, foreignSpecial.body);

  // Yesterday's flag must stop counting without anything having to clean it up.
  await db.product.update({ where: { id: specialProduct.id }, data: { specialOn: '1999-12-31' } });
  const stale = await db.product.findUniqueOrThrow({ where: { id: specialProduct.id } });
  const localToday2 = new Intl.DateTimeFormat('en-CA', {
    timeZone: shop.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  check('A stale special no longer matches today', stale.specialOn !== localToday2, stale.specialOn);

  const clearSpecial = await teaMerchant(`/api/merchant/products/${specialProduct.id}`, {
    method: 'PATCH',
    json: { isTodaysSpecial: false },
  });
  check('Merchant can clear a special', clearSpecial.body.isTodaysSpecial === false, clearSpecial.body);

  // ------------------------------------------------------------- UPI ---
  section('Direct UPI payment');

  await db.shop.update({
    where: { id: shop.id },
    data: { upiId: 'srikumartea@okaxis', upiDepositPercent: 30, allowUpiDeposit: true },
  });

  const upiOrder = await customer('/api/orders', {
    method: 'POST',
    json: {
      shopId: shop.id,
      items: [{ productId: tea.id, quantity: 4, selections: [] }],
      paymentMethod: 'UPI_DEPOSIT',
    },
  });
  check('A UPI deposit order can be placed', upiOrder.status === 201, upiOrder.body);
  const upiOrderId = upiOrder.body.id as string;

  const upiRow = await db.order.findUniqueOrThrow({ where: { id: upiOrderId } });
  const expectedDeposit = Math.round((upiRow.totalMinor * 0.3) / 100) * 100;
  check(
    'The deposit is computed server-side from the shop percentage',
    upiRow.amountDueOnlineMinor === expectedDeposit,
    { got: upiRow.amountDueOnlineMinor, expected: expectedDeposit },
  );
  check('Nothing is counted as paid before the shop confirms', upiRow.amountPaidMinor === 0);

  const upiIntent = await customer(`/api/orders/${upiOrderId}/upi`);
  check('A UPI pay link is produced', upiIntent.status === 200, upiIntent.body);
  const uri = upiIntent.body.uri as string;
  check('The link is a upi://pay deep link', uri.startsWith('upi://pay?'), uri);
  check('It addresses the shop’s own UPI ID', uri.includes(`pa=${encodeURIComponent('srikumartea@okaxis')}`), uri);
  check('The amount is the deposit, formatted to 2dp', uri.includes(`am=${(expectedDeposit / 100).toFixed(2)}`), uri);
  check('Spaces in the payee name are percent-encoded', uri.includes('%20'), uri);
  check('A scannable QR is included for desktop', String(upiIntent.body.qrDataUrl).startsWith('data:image/png'));
  check(
    'The counter balance is stated',
    upiIntent.body.balanceAtCounterMinor === upiRow.totalMinor - expectedDeposit,
    upiIntent.body.balanceAtCounterMinor,
  );

  const strangerIntent = await stranger(`/api/orders/${upiOrderId}/upi`);
  check('Another customer cannot fetch your pay link', strangerIntent.status === 403, strangerIntent.body);

  // The shop must not commit kitchen time on the customer's word alone.
  const acceptUnverified = await teaMerchant(`/api/merchant/orders/${upiOrderId}/transition`, {
    method: 'POST',
    json: { to: 'ACCEPTED' },
  });
  check('An unpaid UPI order cannot be accepted', acceptUnverified.status === 409, acceptUnverified.body);

  const badRef = await customer(`/api/orders/${upiOrderId}/upi`, {
    method: 'POST',
    json: { reference: 'no' },
  });
  check('An implausible UPI reference is refused', badRef.status === 422, badRef.body);

  const submitted = await customer(`/api/orders/${upiOrderId}/upi`, {
    method: 'POST',
    json: { reference: '412345678901' },
  });
  check('The customer can submit their UPI reference', submitted.status === 200, submitted.body);
  check(
    'Submitting a reference does NOT mark the order paid',
    submitted.body.status === 'AWAITING_VERIFICATION',
    submitted.body,
  );

  const afterClaim = await db.order.findUniqueOrThrow({ where: { id: upiOrderId } });
  check('The order still shows nothing received', afterClaim.amountPaidMinor === 0, afterClaim.amountPaidMinor);
  check('The order is awaiting verification', afterClaim.paymentStatus === 'AWAITING_VERIFICATION');

  const duplicateRef = await customer(`/api/orders/${upiOrderId}/upi`, {
    method: 'POST',
    json: { reference: '412345678901' },
  });
  check('Re-submitting the same reference is idempotent', duplicateRef.body.alreadySubmitted === true, duplicateRef.body);

  const stillCannotAccept = await teaMerchant(`/api/merchant/orders/${upiOrderId}/transition`, {
    method: 'POST',
    json: { to: 'ACCEPTED' },
  });
  check(
    'A claimed-but-unconfirmed payment still blocks acceptance',
    stillCannotAccept.status === 409,
    stillCannotAccept.body,
  );

  const foreignConfirm = await merchant(`/api/merchant/orders/${upiOrderId}/confirm-payment`, {
    method: 'POST',
    json: { received: true },
  });
  check('Another shop cannot confirm this payment', foreignConfirm.status === 403, foreignConfirm.body);

  const confirmed = await teaMerchant(`/api/merchant/orders/${upiOrderId}/confirm-payment`, {
    method: 'POST',
    json: { received: true },
  });
  check('The shop can confirm the payment arrived', confirmed.status === 200, confirmed.body);

  const afterConfirm = await db.order.findUniqueOrThrow({ where: { id: upiOrderId } });
  check('A confirmed deposit is recorded as paid money', afterConfirm.amountPaidMinor === expectedDeposit);
  check('The order is only partially paid', afterConfirm.paymentStatus === 'PARTIALLY_PAID', afterConfirm.paymentStatus);

  const acceptNow = await teaMerchant(`/api/merchant/orders/${upiOrderId}/transition`, {
    method: 'POST',
    json: { to: 'ACCEPTED' },
  });
  check('A confirmed deposit unblocks acceptance', acceptNow.status === 200, acceptNow.body);

  await teaMerchant(`/api/merchant/orders/${upiOrderId}/transition`, { method: 'POST', json: { to: 'READY' } });
  await teaMerchant(`/api/merchant/orders/${upiOrderId}/transition`, { method: 'POST', json: { to: 'PICKED_UP' } });

  const settled = await db.order.findUniqueOrThrow({ where: { id: upiOrderId } });
  check('Collecting the balance at pickup settles the order', settled.paymentStatus === 'PAID', settled.paymentStatus);
  check('The full amount is recorded as paid', settled.amountPaidMinor === settled.totalMinor, {
    paid: settled.amountPaidMinor,
    total: settled.totalMinor,
  });

  // A shop that has not entered a UPI ID cannot be paid this way.
  const noUpiShop = await db.shop.findFirstOrThrow({ where: { upiId: null, isActive: true, isVerified: true } });
  const noUpiProduct = await db.product.findFirstOrThrow({
    where: { shopId: noUpiShop.id, availability: 'AVAILABLE', optionGroups: { none: {} } },
  });
  await db.shop.update({ where: { id: noUpiShop.id }, data: { status: 'OPEN' } });
  const upiUnavailable = await customer('/api/orders', {
    method: 'POST',
    json: {
      shopId: noUpiShop.id,
      items: [{ productId: noUpiProduct.id, quantity: 1, selections: [] }],
      paymentMethod: 'UPI_FULL',
    },
  });
  check('A shop without a UPI ID cannot take UPI orders', upiUnavailable.status === 422, upiUnavailable.body);

  // ------------------------------------------------------ shop capacity ---
  section('Shop capacity limit');
  // Close anything still open at this shop (including orders left behind by an
  // earlier run) so "capacity 1" starts from a known empty kitchen.
  await db.order.updateMany({
    where: { shopId: shop.id, status: { in: ['PLACED', 'ACCEPTED', 'PREPARING', 'READY'] } },
    data: { status: 'EXPIRED', closedAt: new Date() },
  });
  await db.shop.update({ where: { id: shop.id }, data: { maxActiveOrders: 1 } });

  const firstOfTwo = await customer('/api/orders', {
    method: 'POST',
    json: {
      shopId: shop.id,
      items: [{ productId: tea.id, quantity: 1, selections: [] }],
      paymentMethod: 'CASH_ON_PICKUP',
    },
  });
  const overCapacity = await stranger('/api/orders', {
    method: 'POST',
    json: {
      shopId: shop.id,
      items: [{ productId: tea.id, quantity: 1, selections: [] }],
      paymentMethod: 'CASH_ON_PICKUP',
    },
  });
  check('First order within capacity succeeds', firstOfTwo.status === 201, firstOfTwo.body);
  check('Orders beyond shop capacity are refused', overCapacity.status === 409, overCapacity.body);

  await db.shop.update({ where: { id: shop.id }, data: { maxActiveOrders: 15 } });

  await db.$disconnect();

  // -------------------------------------------------------------- report ---
  console.log(`\n${'─'.repeat(56)}`);
  console.log(`${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('\nFailures:');
    for (const failure of failures) console.log(`  • ${failure}`);
    process.exit(1);
  }
  console.log('\nAll workflow and edge-case tests passed.');
}

main().catch((error) => {
  console.error('\nTest run crashed:', error);
  process.exit(1);
});
