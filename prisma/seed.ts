/**
 * Demo data for a single launch neighbourhood.
 *
 * Modelled on the recommended launch strategy (section 33): one city, a
 * walkable cluster of high-frequency shops, prices in rupees. Everything here
 * is fictional.
 *
 * Run with `pnpm db:seed`, or `pnpm db:reset` to wipe first.
 */
import { PrismaClient, type Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';

const db = new PrismaClient();

/** Shared demo password. Printed at the end so it is never a mystery. */
const DEMO_PASSWORD = 'takeaway123';

/** Tuticorin (Thoothukudi) town centre. */
const CITY = { name: 'Tuticorin', latitude: 8.7642, longitude: 78.1348 };

/** Offsets a few hundred metres from the centre so distances look real. */
function nearby(dLat: number, dLng: number) {
  return { latitude: CITY.latitude + dLat, longitude: CITY.longitude + dLng };
}

const CATEGORIES = [
  { slug: 'tea', name: 'Tea', emoji: '☕', sortOrder: 1 },
  { slug: 'breakfast', name: 'Breakfast', emoji: '🍛', sortOrder: 2 },
  { slug: 'juice', name: 'Juice', emoji: '🥤', sortOrder: 3 },
  { slug: 'fast-food', name: 'Fast Food', emoji: '🍔', sortOrder: 4 },
  { slug: 'bakery', name: 'Bakery', emoji: '🥐', sortOrder: 5 },
  { slug: 'street-food', name: 'Street Food', emoji: '🌯', sortOrder: 6 },
];

/**
 * Demo opening hours.
 *
 * Most shops are seeded round-the-clock so the full order → pickup workflow can
 * be exercised whenever someone sits down to test it. City Bakery keeps
 * realistic 7 AM–9 PM hours on purpose, so the closed state, the "Opens at …"
 * message and the block on ordering are all demonstrable too.
 *
 * Real shops set their own hours from the merchant dashboard.
 */
function alwaysOpenHours() {
  return Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, opensAt: 0, closesAt: 1440, isClosed: false }));
}

function hours(opensAt: number, closesAt: number) {
  return Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, opensAt, closesAt, isClosed: false }));
}

type SeedProduct = {
  name: string;
  description?: string;
  priceMinor: number;
  prepMinutes: number;
  section: string;
  isPopular?: boolean;
  unitLabel?: string;
  optionGroups?: {
    name: string;
    minSelect: number;
    maxSelect: number;
    options: { name: string; priceDeltaMinor?: number; prepDeltaMinutes?: number }[];
  }[];
};

type SeedShop = {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  categorySlug: string;
  tags: string[];
  addressLine: string;
  coords: { latitude: number; longitude: number };
  phone: string;
  orderCodePrefix: string;
  basePrepMinutes: number;
  baselineWaitMinutes: number;
  maxActiveOrders: number;
  status: 'OPEN' | 'BUSY' | 'VERY_BUSY';
  merchant: { name: string; email: string; businessName: string; phone: string };
  sections: string[];
  products: SeedProduct[];
};

const SPICE_GROUP = {
  name: 'Spice level',
  minSelect: 1,
  maxSelect: 1,
  options: [{ name: 'Regular' }, { name: 'Spicy', prepDeltaMinutes: 1 }, { name: 'Less spicy' }],
};

const SHOPS: SeedShop[] = [
  {
    slug: 'sri-kumar-tea-stall',
    name: 'Sri Kumar Tea Stall',
    tagline: 'The 4 o’clock chai everyone queues for',
    description:
      'A family-run tea stall near the bus stand, serving strong filter coffee and masala tea since 1998. Busiest between 8–10 AM and 4–6 PM.',
    categorySlug: 'tea',
    tags: ['Tea', 'Coffee', 'Snacks'],
    addressLine: '12 Palayamkottai Road, near the bus stand',
    coords: nearby(0.004, 0.003),
    phone: '9840112233',
    orderCodePrefix: 'A',
    basePrepMinutes: 6,
    baselineWaitMinutes: 12,
    maxActiveOrders: 15,
    status: 'OPEN',
    merchant: { name: 'Kumar Selvam', email: 'kumar@takeaway.test', businessName: 'Sri Kumar Tea Stall', phone: '9840112233' },
    sections: ['Popular', 'Tea', 'Coffee', 'Snacks'],
    products: [
      { name: 'Masala Tea', description: 'Strong tea boiled with cardamom, ginger and clove.', priceMinor: 1500, prepMinutes: 4, section: 'Popular', isPopular: true, unitLabel: '1 cup' },
      { name: 'Filter Coffee', description: 'Degree coffee, frothed the traditional way.', priceMinor: 2500, prepMinutes: 5, section: 'Popular', isPopular: true, unitLabel: '1 cup',
        optionGroups: [{ name: 'Sugar', minSelect: 1, maxSelect: 1, options: [{ name: 'Normal sugar' }, { name: 'Less sugar' }, { name: 'No sugar' }] }] },
      { name: 'Plain Tea', priceMinor: 1200, prepMinutes: 3, section: 'Tea', unitLabel: '1 cup' },
      { name: 'Ginger Tea', description: 'Extra ginger, good for a scratchy throat.', priceMinor: 1800, prepMinutes: 4, section: 'Tea', unitLabel: '1 cup' },
      { name: 'Black Coffee', priceMinor: 2000, prepMinutes: 4, section: 'Coffee', unitLabel: '1 cup' },
      { name: 'Samosa', description: 'Fried fresh through the evening.', priceMinor: 2000, prepMinutes: 6, section: 'Snacks', isPopular: true,
        optionGroups: [{ name: 'Add-ons', minSelect: 0, maxSelect: 2, options: [{ name: 'Extra chutney', priceDeltaMinor: 500 }, { name: 'Green chilli', priceDeltaMinor: 0 }] }] },
      { name: 'Vada', priceMinor: 1500, prepMinutes: 7, section: 'Snacks' },
      { name: 'Bun Butter Jam', priceMinor: 3000, prepMinutes: 4, section: 'Snacks' },
    ],
  },
  {
    slug: 'annapoorna-breakfast',
    name: 'Annapoorna Breakfast',
    tagline: 'Idli, dosa and sambar from 6 AM',
    description:
      'Breakfast counter that turns over three hundred plates before 10 AM. Pre-ordering here saves the most time on a weekday morning.',
    categorySlug: 'breakfast',
    tags: ['Idli', 'Dosa', 'Pongal'],
    addressLine: '4 Beach Road, opposite the school',
    coords: nearby(-0.006, 0.002),
    phone: '9840223344',
    orderCodePrefix: 'B',
    basePrepMinutes: 11,
    baselineWaitMinutes: 20,
    maxActiveOrders: 25,
    status: 'BUSY',
    merchant: { name: 'Lakshmi Annadurai', email: 'lakshmi@takeaway.test', businessName: 'Annapoorna Breakfast', phone: '9840223344' },
    sections: ['Popular', 'Tiffin', 'Dosa', 'Sides'],
    products: [
      { name: 'Masala Dosa', description: 'Crispy dosa with potato masala, chutney and sambar.', priceMinor: 8000, prepMinutes: 10, section: 'Popular', isPopular: true, unitLabel: '1 plate',
        optionGroups: [SPICE_GROUP, { name: 'Add-ons', minSelect: 0, maxSelect: 3, options: [{ name: 'Extra chutney', priceDeltaMinor: 1000 }, { name: 'Extra sambar', priceDeltaMinor: 1000 }, { name: 'Ghee roast', priceDeltaMinor: 2000, prepDeltaMinutes: 2 }] }] },
      { name: 'Idli (2 pieces)', description: 'Steamed soft, served with sambar and chutney.', priceMinor: 4000, prepMinutes: 6, section: 'Popular', isPopular: true, unitLabel: '2 pieces' },
      { name: 'Ven Pongal', priceMinor: 5500, prepMinutes: 8, section: 'Tiffin', unitLabel: '1 plate' },
      { name: 'Poori Masala', priceMinor: 6000, prepMinutes: 12, section: 'Tiffin', unitLabel: '1 plate' },
      { name: 'Plain Dosa', priceMinor: 5000, prepMinutes: 8, section: 'Dosa', optionGroups: [SPICE_GROUP] },
      { name: 'Onion Uthappam', priceMinor: 7000, prepMinutes: 11, section: 'Dosa' },
      { name: 'Extra Sambar', priceMinor: 1500, prepMinutes: 2, section: 'Sides', unitLabel: '1 bowl' },
      { name: 'Curd Rice', priceMinor: 5000, prepMinutes: 4, section: 'Sides' },
    ],
  },
  {
    slug: 'fresh-juice-corner',
    name: 'Fresh Juice Corner',
    tagline: 'Pressed to order, never pre-mixed',
    description: 'Seasonal fruit juices and milkshakes made after you order, so nothing sits around losing its edge.',
    categorySlug: 'juice',
    tags: ['Juice', 'Milkshake', 'Fruit'],
    addressLine: '88 Millerpuram Main Road',
    coords: nearby(0.009, -0.004),
    phone: '9840334455',
    orderCodePrefix: 'J',
    basePrepMinutes: 5,
    baselineWaitMinutes: 10,
    maxActiveOrders: 12,
    status: 'OPEN',
    merchant: { name: 'Arun Prakash', email: 'arun@takeaway.test', businessName: 'Fresh Juice Corner', phone: '9840334455' },
    sections: ['Popular', 'Fresh Juice', 'Milkshakes'],
    products: [
      { name: 'Fresh Orange Juice', priceMinor: 8000, prepMinutes: 5, section: 'Popular', isPopular: true, unitLabel: '300 ml',
        optionGroups: [{ name: 'Preparation', minSelect: 1, maxSelect: 1, options: [{ name: 'With ice' }, { name: 'No ice' }, { name: 'No sugar' }] }] },
      { name: 'Mango Juice', priceMinor: 7000, prepMinutes: 5, section: 'Popular', isPopular: true, unitLabel: '300 ml' },
      { name: 'Watermelon Juice', priceMinor: 5000, prepMinutes: 4, section: 'Fresh Juice', unitLabel: '300 ml' },
      { name: 'Lime Soda', priceMinor: 4000, prepMinutes: 3, section: 'Fresh Juice', unitLabel: '250 ml' },
      { name: 'Pomegranate Juice', priceMinor: 9000, prepMinutes: 6, section: 'Fresh Juice', unitLabel: '300 ml' },
      { name: 'Banana Milkshake', priceMinor: 8500, prepMinutes: 6, section: 'Milkshakes', unitLabel: '350 ml' },
      { name: 'Chocolate Milkshake', priceMinor: 9500, prepMinutes: 6, section: 'Milkshakes', unitLabel: '350 ml' },
    ],
  },
  {
    slug: 'city-bakery',
    name: 'City Bakery',
    tagline: 'Puffs out of the oven every hour',
    description: 'Neighbourhood bakery for evening snacks, birthday cakes and the vegetable puff everyone grew up on.',
    categorySlug: 'bakery',
    tags: ['Bakery', 'Cakes', 'Puffs'],
    addressLine: '21 George Road',
    coords: nearby(-0.011, -0.008),
    phone: '9840445566',
    orderCodePrefix: 'C',
    basePrepMinutes: 4,
    baselineWaitMinutes: 8,
    maxActiveOrders: 0,
    status: 'OPEN',
    merchant: { name: 'Fathima Noor', email: 'fathima@takeaway.test', businessName: 'City Bakery', phone: '9840445566' },
    sections: ['Popular', 'Savoury', 'Sweet'],
    products: [
      { name: 'Vegetable Puff', priceMinor: 2500, prepMinutes: 3, section: 'Popular', isPopular: true },
      { name: 'Egg Puff', priceMinor: 3000, prepMinutes: 3, section: 'Popular', isPopular: true },
      { name: 'Cream Bun', priceMinor: 2000, prepMinutes: 2, section: 'Sweet' },
      { name: 'Dilkush', priceMinor: 3500, prepMinutes: 2, section: 'Sweet' },
      { name: 'Butter Biscuit', priceMinor: 2000, prepMinutes: 2, section: 'Sweet', unitLabel: '250 g' },
      { name: 'Masala Bun', priceMinor: 2500, prepMinutes: 3, section: 'Savoury' },
    ],
  },
  {
    slug: 'quick-bites-shawarma',
    name: 'Quick Bites Shawarma',
    tagline: 'Rolls off the grill in ten minutes',
    description: 'Late-evening shawarma, grilled sandwiches and fries. Peak rush is 7–9 PM when the queue reaches the road.',
    categorySlug: 'street-food',
    tags: ['Shawarma', 'Rolls', 'Fries'],
    addressLine: '3 VE Road, near the theatre',
    coords: nearby(0.013, 0.011),
    phone: '9840556677',
    orderCodePrefix: 'S',
    basePrepMinutes: 12,
    baselineWaitMinutes: 25,
    maxActiveOrders: 18,
    status: 'VERY_BUSY',
    merchant: { name: 'Imran Sheikh', email: 'imran@takeaway.test', businessName: 'Quick Bites Shawarma', phone: '9840556677' },
    sections: ['Popular', 'Shawarma', 'Sides'],
    products: [
      { name: 'Chicken Shawarma Roll', description: 'Grilled chicken, garlic sauce and pickle in a warm roti.', priceMinor: 12000, prepMinutes: 11, section: 'Popular', isPopular: true,
        optionGroups: [SPICE_GROUP, { name: 'Add-ons', minSelect: 0, maxSelect: 3, options: [{ name: 'Extra garlic sauce', priceDeltaMinor: 1500 }, { name: 'Extra chicken', priceDeltaMinor: 4000, prepDeltaMinutes: 2 }, { name: 'Cheese', priceDeltaMinor: 3000 }] }] },
      { name: 'Shawarma Plate', priceMinor: 18000, prepMinutes: 14, section: 'Popular', isPopular: true, unitLabel: '1 plate', optionGroups: [SPICE_GROUP] },
      { name: 'Grilled Chicken Sandwich', priceMinor: 11000, prepMinutes: 10, section: 'Shawarma' },
      { name: 'French Fries', priceMinor: 7000, prepMinutes: 8, section: 'Sides', unitLabel: '1 packet',
        optionGroups: [{ name: 'Seasoning', minSelect: 0, maxSelect: 1, options: [{ name: 'Peri peri', priceDeltaMinor: 1000 }, { name: 'Cheese dip', priceDeltaMinor: 2500 }] }] },
      { name: 'Soft Drink', priceMinor: 4000, prepMinutes: 1, section: 'Sides', unitLabel: '250 ml' },
    ],
  },
  {
    slug: 'green-fruit-mart',
    name: 'Green Fruit Mart',
    tagline: 'Weighed and bagged before you arrive',
    description:
      'Fruit and vegetable shop. Order by weight and collect a packed bag — no queueing at the weighing scale.',
    categorySlug: 'fast-food',
    tags: ['Fruit', 'Vegetables', 'Daily needs'],
    addressLine: '57 Market Street',
    coords: nearby(-0.003, 0.014),
    phone: '9840667788',
    orderCodePrefix: 'G',
    basePrepMinutes: 8,
    baselineWaitMinutes: 15,
    maxActiveOrders: 10,
    status: 'OPEN',
    merchant: { name: 'Vasanthi Murugan', email: 'vasanthi@takeaway.test', businessName: 'Green Fruit Mart', phone: '9840667788' },
    sections: ['Popular', 'Fruit', 'Vegetables'],
    products: [
      { name: 'Bananas', priceMinor: 6000, prepMinutes: 4, section: 'Popular', isPopular: true, unitLabel: 'per dozen' },
      { name: 'Alphonso Mangoes', priceMinor: 25000, prepMinutes: 6, section: 'Popular', isPopular: true, unitLabel: 'per kg' },
      { name: 'Pomegranate', priceMinor: 18000, prepMinutes: 5, section: 'Fruit', unitLabel: 'per kg' },
      { name: 'Sweet Lime', priceMinor: 9000, prepMinutes: 5, section: 'Fruit', unitLabel: 'per kg' },
      { name: 'Tomatoes', priceMinor: 4000, prepMinutes: 4, section: 'Vegetables', unitLabel: 'per kg' },
      { name: 'Onions', priceMinor: 3500, prepMinutes: 4, section: 'Vegetables', unitLabel: 'per kg' },
    ],
  },
];

async function main() {
  console.log('• Seeding demo data …');

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // ---- Categories --------------------------------------------------------
  for (const category of CATEGORIES) {
    await db.category.upsert({
      where: { slug: category.slug },
      update: category,
      create: category,
    });
  }
  const categoryBySlug = new Map((await db.category.findMany()).map((c) => [c.slug, c]));

  // ---- Platform settings -------------------------------------------------
  const settings: { key: string; value: Prisma.InputJsonValue; description: string }[] = [
    { key: 'commission.percent', value: 0, description: 'Platform commission on each order, in percent.' },
    { key: 'subscription.monthlyMinor', value: 29900, description: 'Merchant subscription price per month, in paise.' },
    {
      key: 'cancellation.policy',
      value: { customerCancelBeforeAccept: true, refundOnReject: true },
      description: 'Order cancellation rules.',
    },
    { key: 'orders.autoExpireMinutes', value: 90, description: 'Ready orders not collected within this window expire.' },
  ];
  for (const setting of settings) {
    await db.platformSetting.upsert({
      where: { key: setting.key },
      update: { value: setting.value, description: setting.description },
      create: setting,
    });
  }

  // ---- Admin -------------------------------------------------------------
  await db.user.upsert({
    where: { email: 'admin@takeaway.test' },
    update: {},
    create: {
      name: 'Platform Admin',
      email: 'admin@takeaway.test',
      phone: '9800000001',
      passwordHash,
      role: 'ADMIN',
    },
  });

  // ---- Customers ---------------------------------------------------------
  const customers = [
    { name: 'Priya Raman', email: 'priya@takeaway.test', phone: '9800000010' },
    { name: 'Rahul Menon', email: 'rahul@takeaway.test', phone: '9800000011' },
  ];
  for (const customer of customers) {
    await db.user.upsert({
      where: { email: customer.email },
      update: {},
      create: {
        ...customer,
        passwordHash,
        role: 'CUSTOMER',
        customerProfile: {
          create: { defaultCity: CITY.name, defaultLatitude: CITY.latitude, defaultLongitude: CITY.longitude },
        },
      },
    });
  }

  // ---- Merchants, shops, menus ------------------------------------------
  for (const seed of SHOPS) {
    const merchantUser = await db.user.upsert({
      where: { email: seed.merchant.email },
      update: {},
      create: {
        name: seed.merchant.name,
        email: seed.merchant.email,
        phone: seed.merchant.phone,
        passwordHash,
        role: 'MERCHANT',
        merchant: {
          create: {
            businessName: seed.merchant.businessName,
            contactPhone: seed.merchant.phone,
            verificationStatus: 'VERIFIED',
            verifiedAt: new Date(),
          },
        },
      },
      include: { merchant: true },
    });

    const merchant =
      merchantUser.merchant ?? (await db.merchant.findUniqueOrThrow({ where: { userId: merchantUser.id } }));

    const category = categoryBySlug.get(seed.categorySlug);
    if (!category) throw new Error(`Unknown category ${seed.categorySlug}`);

    const shop = await db.shop.upsert({
      where: { slug: seed.slug },
      update: {
        status: seed.status,
        basePrepMinutes: seed.basePrepMinutes,
        baselineWaitMinutes: seed.baselineWaitMinutes,
        maxActiveOrders: seed.maxActiveOrders,
      },
      create: {
        slug: seed.slug,
        merchantId: merchant.id,
        name: seed.name,
        tagline: seed.tagline,
        description: seed.description,
        categoryId: category.id,
        tags: seed.tags,
        addressLine: seed.addressLine,
        city: CITY.name,
        pincode: '628001',
        latitude: seed.coords.latitude,
        longitude: seed.coords.longitude,
        phone: seed.phone,
        status: seed.status,
        statusSetAt: new Date(),
        basePrepMinutes: seed.basePrepMinutes,
        baselineWaitMinutes: seed.baselineWaitMinutes,
        maxActiveOrders: seed.maxActiveOrders,
        orderCodePrefix: seed.orderCodePrefix,
        isVerified: true,
        isActive: true,
      },
    });

    await db.shopOperatingHours.deleteMany({ where: { shopId: shop.id } });
    await db.shopOperatingHours.createMany({
      data: (seed.slug === 'city-bakery' ? hours(7 * 60, 21 * 60) : alwaysOpenHours()).map((h) => ({
        ...h,
        shopId: shop.id,
      })),
    });

    // Rebuild the menu from scratch so re-seeding cannot leave stale items.
    await db.product.deleteMany({ where: { shopId: shop.id } });
    await db.menuCategory.deleteMany({ where: { shopId: shop.id } });

    const sectionIds = new Map<string, string>();
    for (const [index, name] of seed.sections.entries()) {
      const created = await db.menuCategory.create({
        data: { shopId: shop.id, name, sortOrder: index },
      });
      sectionIds.set(name, created.id);
    }

    for (const [index, product] of seed.products.entries()) {
      await db.product.create({
        data: {
          shopId: shop.id,
          menuCategoryId: sectionIds.get(product.section),
          name: product.name,
          description: product.description,
          priceMinor: product.priceMinor,
          prepMinutes: product.prepMinutes,
          unitLabel: product.unitLabel ?? '',
          isPopular: product.isPopular ?? false,
          sortOrder: index,
          optionGroups: product.optionGroups
            ? {
                create: product.optionGroups.map((group, groupIndex) => ({
                  name: group.name,
                  minSelect: group.minSelect,
                  maxSelect: group.maxSelect,
                  sortOrder: groupIndex,
                  options: {
                    create: group.options.map((option, optionIndex) => ({
                      name: option.name,
                      priceDeltaMinor: option.priceDeltaMinor ?? 0,
                      prepDeltaMinutes: option.prepDeltaMinutes ?? 0,
                      sortOrder: optionIndex,
                    })),
                  },
                })),
              }
            : undefined,
        },
      });
    }

    console.log(`  ✓ ${seed.name} — ${seed.products.length} products`);
  }

  // Demo UPI IDs so direct payment is testable out of the box. These are
  // fictional handles — a real shop enters its own in merchant settings, and
  // that is the entire setup: no gateway account, no onboarding, no commission.
  for (const [shopSlug, upiId, percent] of [
    ['sri-kumar-tea-stall', 'srikumartea@okaxis', 30],
    ['annapoorna-breakfast', 'annapoorna@okhdfcbank', 40],
    ['fresh-juice-corner', 'freshjuice@oksbi', 30],
  ] as const) {
    await db.shop.updateMany({
      where: { slug: shopSlug },
      data: { upiId, upiDepositPercent: percent, allowUpiDeposit: true },
    });
  }

  // A couple of today's specials so the feature is visible straight away.
  // `specialOn` holds the shop's local date, so these expire by themselves
  // overnight exactly as a real special would.
  for (const [shopSlug, productName, note] of [
    ['sri-kumar-tea-stall', 'Masala Tea', 'Fresh ginger batch all morning'],
    ['annapoorna-breakfast', 'Masala Dosa', 'Served with extra chutney today'],
    ['fresh-juice-corner', 'Mango Juice', 'Alphonso season — while stocks last'],
  ] as const) {
    const shop = await db.shop.findUnique({ where: { slug: shopSlug }, select: { id: true, timeZone: true } });
    if (!shop) continue;

    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: shop.timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

    await db.product.updateMany({
      where: { shopId: shop.id, name: productName },
      data: { specialOn: today, specialNote: note },
    });
  }

  // A counter-staff account on the busiest shop, to exercise the STAFF role.
  const breakfast = await db.shop.findUniqueOrThrow({ where: { slug: 'annapoorna-breakfast' } });
  const staffUser = await db.user.upsert({
    where: { email: 'counter@takeaway.test' },
    update: {},
    create: {
      name: 'Counter Staff',
      email: 'counter@takeaway.test',
      phone: '9800000020',
      passwordHash,
      role: 'STAFF',
    },
  });
  await db.shopStaff.upsert({
    where: { shopId_userId: { shopId: breakfast.id, userId: staffUser.id } },
    update: {},
    create: { shopId: breakfast.id, userId: staffUser.id, role: 'COUNTER' },
  });

  // A merchant still awaiting verification, so the admin queue is not empty.
  await db.user.upsert({
    where: { email: 'pending@takeaway.test' },
    update: {},
    create: {
      name: 'Suresh Babu',
      email: 'pending@takeaway.test',
      phone: '9800000030',
      passwordHash,
      role: 'MERCHANT',
      merchant: {
        create: {
          businessName: 'Suresh Fruit Stall',
          contactPhone: '9800000030',
          verificationStatus: 'PENDING',
        },
      },
    },
  });

  console.log('\n  Demo accounts (password for all: ' + DEMO_PASSWORD + ')\n');
  console.log('   Admin      admin@takeaway.test');
  console.log('   Customer   priya@takeaway.test');
  console.log('   Merchant   kumar@takeaway.test      (Sri Kumar Tea Stall)');
  console.log('   Merchant   lakshmi@takeaway.test    (Annapoorna Breakfast)');
  console.log('   Staff      counter@takeaway.test    (Annapoorna Breakfast)');
  console.log('   Pending    pending@takeaway.test    (awaiting admin verification)\n');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
