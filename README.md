# Takeaway

**Order before you arrive. Pick up when ready. Save your waiting time.**

A pre-order, preparation-management and quick-pickup platform for local shops —
tea stalls, breakfast counters, juice bars, bakeries and street-food stalls.

This is not a delivery app. It exists to convert a customer's *waiting* time into
*travelling* time:

```
before   arrive → see queue → order → wait 15 min → collect
after    order remotely → shop prepares → you travel → "ready" → scan → collect
```

> The product name is a working title and should be trademark-checked before any
> public launch.

---

## What was built

Three working interfaces on one codebase, backed by a real PostgreSQL database
and a real order state machine. Nothing on the critical path is stubbed.

### Customer (mobile-first PWA)

- Location-aware home with greeting, search, categories and quick actions
- Shop discovery with filters (open now, ready fast, favourites) and sorting
  (nearest, ready fastest, most popular); distance recomputed on-device the
  instant location is granted, with no extra request
- Shop page with live status, prominent ready-time estimate, opening hours and a
  scrollable menu
- Products with customisations *and* add-ons via one option model; single-tap add
  for items with no choices
- Client-side cart (one shop at a time), server-authoritative pricing
- Checkout that leads with **when can I collect this**, plus queue position and
  travel-time synchronisation
- Live order tracker with a five-step progress rail, QR pickup code, typed
  fallback code, directions, and a "you saved N minutes" summary
- **Order again** from the home rail, from any past order in history, and from the
  order screen itself. The cart is rebuilt server-side, so prices and availability
  are re-read; if a merchant has since rebuilt their menu, items are re-matched by
  name rather than silently vanishing
- **Today's special** surfaced as tappable chips on the discovery card — one tap
  goes straight to that item on the shop page, highlighted, rather than dropping
  the customer at the top of the menu
- Favourites, in-app notifications, web push opt-in
- Installable PWA with an offline fallback and a hand-written service worker

### Merchant / staff dashboard

- Order board (New / Preparing / Ready / Completed) polling every 6 seconds
- Four taps end-to-end: **Accept → Start preparing → Mark ready → Confirm pickup**,
  each a full-width 56 px button
- One-tap shop status (Open / Busy / Very busy / Pause) that reports the new
  promised time back: *"10 min → 20 min"*
- Reject with a reason, and "running late" delay reporting that notifies the customer
- Menu management with one-tap availability, plus create/edit/delete
- **Today's special**: one tap on the menu row promotes an item to the shop front,
  with an optional note ("Fresh batch at 4 PM"). It expires by itself when the
  shop's day rolls over, so a forgotten flag never advertises Monday's special on
  Thursday
- Pickup verification: camera QR scanner, order-number entry, and pickup-code entry
- Printable permanent shop QR poster linking straight to the menu
- Shop profile, capacity cap, payment methods and opening hours
- Analytics: promised-vs-actual preparation, minutes saved, popular items, peak hours

### Admin dashboard

- Platform overview led by the north-star metric: **total customer waiting minutes saved**
- Merchant verification queue (verifying a merchant makes their shops live)
- Shop, order and user management; deactivation invalidates sessions immediately
- Integration status panel and editable platform settings (commission,
  subscription price, cancellation policy) stored as data, not code

---

## Technology

| Layer | Choice | Why |
| --- | --- | --- |
| Framework | Next.js 16 (App Router), React 19, TypeScript | One codebase for all three interfaces; server components keep the customer bundle small |
| Styling | Tailwind CSS v4 | Design tokens declared once in `globals.css`; no hardcoded colours in components |
| Database | PostgreSQL 18 | Enums, `text[]`, transactions — all used |
| ORM | Prisma 6 | Typed queries and an explicit migration path |
| Auth | `jose` JWT in an httpOnly cookie + bcrypt | No session table; revocation via `User.tokenVersion` |
| Validation | Zod | The same schemas guard client and server |
| QR | `qrcode` (generate) + `html5-qrcode` (scan, lazy-loaded) | Scanner is only downloaded on the scan screen |

Integrations sit behind provider interfaces (`src/lib/providers/`) so each has a
working local implementation and a documented path to the real service:

| Provider | Local default | Production option |
| --- | --- | --- |
| Maps / distance | `haversine` — straight-line + detour factor + walking speed | Google Distance Matrix |
| Payments | **Direct UPI** (no account, no commission) or `mock` gateway | Razorpay (order creation, HMAC verification and refunds implemented) |
| Push | `mock` — logs | Web Push via VAPID (implemented) |
| Storage | `local` — `public/uploads` | S3 (interface defined) |

Missing credentials degrade to the local implementation rather than breaking
checkout.

---

## Running locally

```bash
pnpm install
```

**1. Start PostgreSQL.** If you have Docker or a managed database, point
`DATABASE_URL` at it. Otherwise this project bundles a real PostgreSQL server
that needs no Docker:

```bash
pnpm db:local
```

Leave that running — it prints the `DATABASE_URL` to use.

**2. Configure the environment.**

```bash
cp .env.example .env
```

Set `AUTH_SECRET` to 32+ random characters (`openssl rand -base64 48`) and
`DATABASE_URL` to the value from step 1.

**3. Create the schema and seed demo data.**

```bash
pnpm db:push
pnpm db:seed
```

**4. Run it.**

```bash
pnpm dev
```

Open http://localhost:3000.

### Testing on a phone

This is a mobile-first PWA, so most of it is best judged on a real handset.

```bash
pnpm dev:network
```

That binds to all interfaces. Open `http://<your-machine-ip>:3000` on a phone on
the same Wi-Fi, and set `NEXT_PUBLIC_APP_URL` in `.env` to the same address so
the printable shop QR posters deep-link somewhere the phone can reach.

**Four features will not work over plain HTTP on a LAN address**, because
browsers gate them behind a secure context — this is the browser, not the app:

| Feature | Why it needs HTTPS |
| --- | --- |
| Merchant QR scanner | `getUserMedia` is secure-context only |
| Location / distance | `navigator.geolocation` is secure-context only |
| PWA install | Service workers are secure-context only |
| Web push | Requires a service worker |

Everything else — browsing, ordering, the merchant order board, order-number and
pickup-code verification — works fine over HTTP. `localhost` counts as a secure
context, so on this machine all four work regardless.

To get all four on a phone, either:

```bash
pnpm dev:network:https    # self-signed cert; installs a local root CA (needs admin)
```

…and accept the certificate warning on the phone, or put a tunnel such as
`cloudflared` / `ngrok` in front of `pnpm dev` — which publishes your dev server
to the public internet, so only do that deliberately.

### Other commands

```bash
pnpm build       # production build
pnpm typecheck   # tsc --noEmit
pnpm lint        # eslint
pnpm test:e2e    # end-to-end workflow tests (needs pnpm dev running)
pnpm db:studio   # browse the database
pnpm icons       # regenerate PWA icons from public/icons/icon.svg
```

`pnpm db:reset` drops and recreates everything — destructive, and it will ask for
confirmation.

---

## Environment variables

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | yes | PostgreSQL 14+ connection string |
| `AUTH_SECRET` | yes | 32+ characters; rotating it signs everyone out |
| `AUTH_SESSION_DAYS` | no | Session lifetime, default 30 |
| `NEXT_PUBLIC_APP_URL` | no | Used in shop QR deep links |
| `MAPS_PROVIDER`, `MAPS_API_KEY` | no | `haversine` (default) or `google` |
| `PAYMENTS_PROVIDER`, `RAZORPAY_*` | no | `mock` (default) or `razorpay` |
| `PUSH_PROVIDER`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | no | `mock` (default) or `webpush` |
| `STORAGE_PROVIDER`, `S3_*` | no | `local` (default) or `s3` |

No secret is hardcoded anywhere, and card data never touches this application.

---

## Deploying

### Put the functions next to the database

`vercel.json` pins `regions: ["bom1"]` (Mumbai). This is not cosmetic. Vercel
defaults to `iad1` (Washington DC), and every page that reads the database is
dynamic, so a mismatch means each query crosses the planet twice.

Measured on this app with the database in Mumbai and functions left on the
default region:

| Route | First byte | Fully loaded |
| --- | --- | --- |
| `/signin` (static, no database) | 236 ms | 238 ms |
| `/shops` (dynamic) | 522 ms | **3503 ms** |

The static page was fine; the database-backed pages spent roughly three seconds
in transit. **Set this to whichever region your Supabase project is in** — check
the `X-Vercel-Id` response header to confirm which region actually served you:

```bash
curl -sI https://your-app.vercel.app/ | grep -i x-vercel-id
```

It reads `edge::function::id`, so `bom1::iad1::…` means the request entered at
Mumbai but ran in Washington — the mismatch above. `bom1::bom1::…` is correct.
Common regions: `bom1` Mumbai, `sin1` Singapore, `iad1` Washington.

### Connection strings

Supabase gives two. Both are needed, and they are not interchangeable:

- `DATABASE_URL` — the **pooled** connection (port 6543). Serverless functions
  open many short-lived connections, which is what the pooler exists to absorb.
  Append `?pgbouncer=true&connection_limit=1`.
- `DIRECT_URL` — the **direct** connection (port 5432), used only for migrations,
  which a pooler interferes with.

### A poster QR is permanent

`NEXT_PUBLIC_APP_URL` is baked into the printed counter QR codes. A deployment
refuses to build if it points at `localhost` or a LAN address — see
`src/lib/domain/public-url.ts`. Local production builds only warn, since testing
on a phone over Wi-Fi is a legitimate reason to hold a LAN address.

---

## Test credentials

All demo accounts use the password **`takeaway123`**.

| Role | Email | Notes |
| --- | --- | --- |
| Customer | `priya@takeaway.test` | Has order history |
| Customer | `rahul@takeaway.test` | Clean account |
| Merchant | `kumar@takeaway.test` | Sri Kumar Tea Stall (Open) |
| Merchant | `lakshmi@takeaway.test` | Annapoorna Breakfast (Busy) |
| Merchant | `arun@takeaway.test` | Fresh Juice Corner |
| Merchant | `imran@takeaway.test` | Quick Bites Shawarma (Very busy) |
| Staff | `counter@takeaway.test` | Counter staff at Annapoorna Breakfast |
| Merchant | `pending@takeaway.test` | Awaiting verification — shows the admin queue and the merchant onboarding screen |
| Admin | `admin@takeaway.test` | Platform admin |

Six fictional shops in Tuticorin with 40 menu items priced in rupees. Five are
seeded open round the clock so the workflow can be tested at any hour;
**City Bakery** deliberately keeps 7 AM–9 PM hours so the closed state is
demonstrable.

### Try the critical path

1. Sign in as `priya@takeaway.test`, open **Sri Kumar Tea Stall**, add a Masala Tea and a Samosa, place the order.
2. In another browser (or a private window), sign in as `kumar@takeaway.test` and open **/merchant/orders**.
3. Accept → Start preparing → Mark ready. The customer tab updates within seconds.
4. Go to **/merchant/scan**, type the order number, confirm pickup.
5. The customer sees the minutes they saved.

---

## Database structure

```
User ─┬─ CustomerProfile        reliability counters (private)
      ├─ Merchant ── Shop ─┬─ ShopOperatingHours
      │                    ├─ ShopStaff
      │                    ├─ MenuCategory ── Product ── ProductOptionGroup ── ProductOption
      │                    └─ Order ─┬─ OrderItem
      ├─ FavoriteShop                ├─ OrderStatusEvent   full audit trail
      ├─ Notification                └─ Payment ── Refund
      └─ PushSubscription
Category            platform-wide discovery taxonomy
PlatformSetting     pricing and policy as data, not code
```

Notable decisions:

- **Money is integer paise.** `8000` means ₹80. Never a float.
- **Customisations and add-ons share one model.** A required pick-one group and
  an optional pick-many group differ only by `minSelect`/`maxSelect`, so the
  ordering code path is identical for both.
- **Order items snapshot name and price.** Editing a menu can never rewrite what
  a customer was charged.
- **`Product.unitLabel`** lets the same model describe "1 cup" and "per 500 g",
  so grocery and fruit shops need no schema change.
- **The cart is not in the database.** It lives in `localStorage` so adding an
  item is instant on a weak connection; every rupee is recomputed server-side at
  checkout, so a tampered cart cannot change the price.

---

## How the important parts work

### Preparation time (`src/lib/domain/prep-time.ts`)

```
estimate = max(item prep times)          -- tea and dosa cook in parallel
         + 0.6 min per extra item        -- counter throughput
         + 2.5 min per queued order      -- current kitchen load
         × busy multiplier               -- 1.0 / 1.6 / 2.4
```

Deliberately conservative and explainable rather than clever, and always shown as
a range. Every screen asks this one function, so the estimate on a shop card, at
checkout and on the merchant's order card is always the same number. It is also
the single seam where historical/predictive estimation lands later.

### Order state machine (`src/lib/domain/order-status.ts`)

```
PLACED ──→ ACCEPTED ──→ PREPARING ──→ READY ──→ PICKED_UP
   │           │             │           │
   ├→ REJECTED ├→ CANCELLED  ├→ CANCELLED└→ EXPIRED
   └→ CANCELLED└→ EXPIRED
```

Every transition passes `assertTransition(from, to, actor)`, which checks both
that the move is legal *and* that this actor may make it — a customer cannot
cancel once the shop has committed kitchen time. The read-and-write happens in
one transaction, so two staff phones tapping "Mark ready" cannot both succeed.

### Waiting time saved (the north-star metric)

The claim is "the customer did not stand in a queue", so the quantity that
matters is how long *the customer* waited — from reaching the shop to walking
away with the order. That needs an arrival time, which the customer supplies by
tapping **I'm here**, or which is detected automatically when they share location
and come within 150 m.

```
saved = baselineWaitMinutes − (collected − arrived)
```

Without an arrival time the only available proxy is how long the food sat
between READY and collection, and that measures the wrong thing in both
directions: someone who turns up ten minutes late looks like they queued for ten
minutes, and someone who arrives early and waits looks like they waited not at
all. Those orders are still counted, but `Order.waitMeasured` marks them, and the
admin dashboard reports **measured** and **estimated** totals separately along
with the measurement coverage. The headline number is never presented as harder
evidence than it is.

Two further protections:

- `baselineWaitMinutes` is snapshotted onto the order when it is placed, so
  editing a shop later cannot retroactively rewrite history.
- It is **admin-only**. A merchant who could set it would be able to inflate the
  platform's headline metric simply by claiming a very long queue.

### Order codes and the daily reset

Codes restart at 101 every day (`A101`, `A102`, …), so the *same* code recurs on
consecutive days. Two things this depends on:

- Uniqueness is scoped `[shopId, codeDate, code]`, not `[shopId, code]`. With
  global uniqueness, every shop would be unable to trade from the moment its
  counter reset until it climbed past yesterday's highest number — a daily
  outage.
- The day rolls over in the **shop's** timezone (`Shop.timeZone`), not the
  server's. A UTC rollover would reset a Tuticorin shop's codes at 5:30 AM local,
  in the middle of the breakfast rush.

The counter is allocated by a single atomic `UPDATE … RETURNING`. A read followed
by a write races under PostgreSQL's default READ COMMITTED isolation: two
simultaneous orders derive the same code and one dies on the unique constraint —
precisely during the rush this product exists to serve.

### Direct UPI payment (`src/lib/domain/upi.ts`, `src/lib/services/upi.ts`)

Money moves straight from the customer's UPI app into the shop's own bank
account. The platform is not in the flow: it holds no funds, charges no
commission, and needs no payment-aggregator licence. A shop switches payments on
by typing its UPI ID into settings — there is no gateway onboarding.

The link is the standard deep link, built server-side and percent-encoded:

```
upi://pay?pa=srikumartea%40okaxis&pn=Sri%20Kumar%20Tea%20Stall&cu=INR&am=155.00&tn=Order%20A102&tr=A102
```

Practical details that took a moment to get right:

- **Amounts always carry two decimals.** Some apps reject `am=80.5`.
- **The note is stripped to letters, digits and spaces.** Several PSP apps
  silently drop a payment whose `tn` contains punctuation.
- **App-specific schemes are offered alongside the generic one** (`tez://`,
  `phonepe://`, `paytmmp://`). Android resolves `upi://` to a chooser; iOS
  frequently does not.
- **A QR of the same string is rendered for desktop**, where no `upi://` link can
  open anything.

**Part payment.** A customer can pay a configurable deposit (default 30%) and the
balance in cash at the counter. The deposit is computed server-side from the
shop's own percentage and rounded to whole rupees — a client cannot nominate what
it feels like paying.

**The limitation, stated plainly.** A UPI deep link produces *no callback*. The
payer's app talks to NPCI, not to this server, so nothing can automatically tell
us money arrived. The flow is built around that rather than pretending otherwise:

1. Customer pays in their own app.
2. Customer enters the UPI reference. This records a **claim** — the order moves
   to `AWAITING_VERIFICATION`, never to `PAID`.
3. The shop checks their own UPI app and taps **Payment received**. Only that
   marks money as received, and only that unblocks accepting the order.

Treating step 2 as payment would let anyone type twelve digits and collect free
food, so the state machine refuses to accept an order on a claim alone.

### Pickup verification (`src/lib/services/pickup.ts`)

The QR encodes an HMAC-signed token, not the order id — a QR gets photographed
and forwarded, so possession of an order id must not be enough. Verification is
constant-time, scoped to the caller's shop, and rate limited. Order-number and
pickup-code entry reach the same check, so a dead phone battery never strands a
customer.

---

## Testing

`pnpm test:e2e` drives the real HTTP API against a running server and a seeded
database — no mocks. **124 assertions, all passing**, covering:

- Auth, role separation, and rejection of anonymous ordering
- Server-side pricing, required options, option limits, negative quantities
- Out-of-stock items, paused shops, and the shop capacity cap
- The full critical path, with the travel ETA and audit trail verified
- Cross-tenant access: another customer reading your order, a merchant acting on
  another shop's order, staff of one shop looking up another shop's pickup
- Invalid and duplicated transitions (concurrent taps)
- Delay reporting and the resulting customer notification
- All three pickup routes plus a forged QR token
- The cancellation policy at each stage, and merchant rejection
- Online payment: unpaid orders cannot be accepted, forged signatures are
  refused, duplicate confirmation does not double-charge, and rejecting a paid
  order refunds automatically
- The daily code reset: the same code can be reissued the next day, which a
  global uniqueness constraint would have made impossible
- Arrival reporting, including the geofence rejecting a distant "automatic"
  claim, and measured-vs-estimated marking on the saved-time metric
- Metric integrity: a merchant cannot change the baseline queue wait, an admin can
- Password reset: no account enumeration, tokens stored hashed, forged tokens and
  weak passwords refused
- Menu choices: invalid option groups refused, a newly required choice is enforced
  at checkout, and no merchant can edit another shop's choices
- Order again: rebuilds a past order, refuses another customer's order, and still
  works after a merchant rebuilds their menu
- Today's special: stored as a shop-local date so it expires by itself, a stale
  flag stops matching, and no merchant can flag another shop's items
- Direct UPI: the link is a real `upi://pay` deep link addressed to the shop's own
  VPA with a correctly encoded name and two-decimal amount; the deposit is
  computed server-side; submitting a reference does **not** mark the order paid;
  a claimed-but-unconfirmed payment still blocks acceptance; another shop cannot
  confirm it; and collecting the balance at pickup settles the order

The customer, merchant and admin interfaces were additionally driven by hand in a
browser at mobile width.

---

## Known limitations

Deliberate MVP scope decisions, not oversights:

1. **Shop creation is a human step.** Merchants sign up and land on an onboarding
   screen; an admin verifies them and their shop is created for them. This matches
   the launch plan of onboarding 10–20 shops by hand, so there is no self-serve
   shop-creation form yet.
2. **Image upload is not wired to the UI.** The storage provider and validation
   exist, but shops and products currently render generated gradient artwork keyed
   off their name. It looks intentional and works offline; a real photo wins as
   soon as `imageUrl` is set.
3. **Live updates are polling, not websockets.** 6 s on the merchant board, 8 s on
   the customer tracker (20 s once ready). Chosen for reliability on flaky mobile
   networks — a silently-dead socket is worse than a slightly stale poll.
4. **Push needs VAPID keys, and email needs an API key.** Without them the app
   falls back to in-app notifications and a console email provider that prints
   password-reset links to the server log. Both are fully usable in development;
   neither sends anything to a real inbox or device.
5. **UPI payment cannot be verified automatically, by design of UPI itself.**
   A deep link has no callback, so a human at the shop confirms each payment
   against their own app. That is a real operational cost — roughly five seconds
   per order — and the honest price of taking no commission. Automatic
   reconciliation needs either a payment aggregator (fees, KYC, settlement
   account) or bank statement access via an account-aggregator API. The
   card/net-banking path still runs on the mock gateway; the Razorpay
   implementation is written but unexercised without live keys, and has no
   webhook endpoint yet.
6. **Refunds on UPI are manual.** The platform cannot move money it never held,
   so a refund is the shop sending money back from their own app. Rejecting a
   paid UPI order notifies the customer but cannot reverse the transfer.
7. **Rate limiting is in-process.** Expired windows are swept, so it no longer
   leaks, but the counters are per-instance: move the map in `src/lib/api.ts` to
   Redis before running more than one.
8. **Scheduled pickup slots, group ordering and loyalty are not built.** The spec
   marks all three as post-MVP.
9. **No automatic order-expiry job.** `EXPIRED` is modelled and reachable, but
   nothing sweeps uncollected orders yet; it needs a cron worker.
10. **The Google Maps provider throws if selected.** Intentional — it fails loudly
    rather than returning wrong distances. The default `haversine` provider needs
    no key.
11. **Two client stores hydrate from `localStorage` in an effect**, with targeted
    `react-hooks/set-state-in-effect` suppressions. Correct today; migrating the
    cart and location stores to `useSyncExternalStore` would remove the
    suppressions and add cross-tab sync for free.

---

## Recommended next steps

**Before piloting with real shops**

1. Build the order-expiry worker and the no-show flow (limitation 8).
2. Wire image upload into the merchant menu editor.
3. Add a Razorpay webhook endpoint so payment state does not depend on the client
   completing the round trip.
4. Move rate limiting to Redis, and serve over HTTPS so `secure` cookies apply
   (already conditional on `NODE_ENV`).
5. Add email/SMS OTP sign-in — a tea-stall customer will not want a password.
6. Set each shop's `timeZone` during onboarding. It defaults to `Asia/Kolkata`,
   which is wrong the moment you launch outside India and would reset order codes
   mid-service.
7. Drive measurement coverage up. Until customers routinely tap **I'm here**, most
   of the saved-time figure is inferred rather than measured — the admin dashboard
   shows the split.

**During the pilot**

6. Instrument promised-vs-actual preparation per shop and per hour. That data is
   already recorded; use it to replace the static multipliers in `prep-time.ts`
   with per-shop, per-hour predictions.
7. Watch the no-show rate. If it is material, require prepayment above a threshold
   using the reliability counters already tracked on `CustomerProfile`.
8. Validate pricing with real merchants before hardcoding anything — commission
   and subscription price are already editable from the admin settings screen.

**Once the core is proven**

9. Scheduled pickup slots and smart order batching.
10. Native shells over the PWA, if install friction proves to be a real barrier.
