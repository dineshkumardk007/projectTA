/**
 * Standard pre-configured catalog templates for 1-click merchant onboarding.
 * Allows grocery/kirana, tea/coffee, juice/fruit, and bakery shops to populate
 * popular regional catalog items instantly.
 */

export type TemplateProduct = {
  name: string;
  priceMinor: number;
  prepMinutes: number;
  unitLabel: string;
  description?: string;
  isPopular?: boolean;
};

export type TemplateCategory = {
  categoryName: string;
  products: TemplateProduct[];
};

export type CatalogTemplate = {
  id: string;
  name: string;
  description: string;
  emoji: string;
  categories: TemplateCategory[];
};

export const CATALOG_TEMPLATES: Record<string, CatalogTemplate> = {
  'kirana-grocery': {
    id: 'kirana-grocery',
    name: 'Kirana & General Grocery',
    description: '20+ daily essential staples (Atta, Rice, Milk, Oils, Pulses, Soaps)',
    emoji: '🛒',
    categories: [
      {
        categoryName: 'Daily Essentials & Dairy',
        products: [
          { name: 'Fresh Milk (500 ml)', priceMinor: 2800, prepMinutes: 1, unitLabel: 'per pkt', isPopular: true },
          { name: 'Amul Salted Butter (100 g)', priceMinor: 5800, prepMinutes: 1, unitLabel: 'per pkt', isPopular: true },
          { name: 'Curd / Dahi (400 g)', priceMinor: 4000, prepMinutes: 1, unitLabel: 'per tub' },
          { name: 'Paneer (200 g)', priceMinor: 11000, prepMinutes: 1, unitLabel: 'per pkt' },
        ],
      },
      {
        categoryName: 'Flour, Grains & Pulses',
        products: [
          { name: 'Aashirvaad Whole Wheat Atta (1 kg)', priceMinor: 6500, prepMinutes: 2, unitLabel: 'per bag', isPopular: true },
          { name: 'Basmati Rice (1 kg)', priceMinor: 12000, prepMinutes: 2, unitLabel: 'per bag' },
          { name: 'Toor Dal (1 kg)', priceMinor: 16000, prepMinutes: 2, unitLabel: 'per bag' },
          { name: 'Moong Dal (500 g)', priceMinor: 7500, prepMinutes: 2, unitLabel: 'per bag' },
          { name: 'Refined Sugar (1 kg)', priceMinor: 4800, prepMinutes: 1, unitLabel: 'per bag' },
          { name: 'Iodised Salt (1 kg)', priceMinor: 2800, prepMinutes: 1, unitLabel: 'per pkt' },
        ],
      },
      {
        categoryName: 'Oils, Spices & Condiments',
        products: [
          { name: 'Sunflower Cooking Oil (1 L)', priceMinor: 14500, prepMinutes: 2, unitLabel: 'per pouch', isPopular: true },
          { name: 'Mustard Oil (1 L)', priceMinor: 16000, prepMinutes: 2, unitLabel: 'per bottle' },
          { name: 'Chilli Powder (100 g)', priceMinor: 4500, prepMinutes: 1, unitLabel: 'per pkt' },
          { name: 'Turmeric Powder (100 g)', priceMinor: 3500, prepMinutes: 1, unitLabel: 'per pkt' },
          { name: 'Garam Masala (50 g)', priceMinor: 5500, prepMinutes: 1, unitLabel: 'per pkt' },
        ],
      },
      {
        categoryName: 'Snacks & Beverages',
        products: [
          { name: 'Tea Powder (250 g)', priceMinor: 14000, prepMinutes: 1, unitLabel: 'per pkt', isPopular: true },
          { name: 'Instant Coffee (50 g)', priceMinor: 18000, prepMinutes: 1, unitLabel: 'per jar' },
          { name: 'Marie Gold Biscuits (120 g)', priceMinor: 2000, prepMinutes: 1, unitLabel: 'per pkt' },
          { name: 'Maggi 2-Min Noodles (4-Pack)', priceMinor: 5600, prepMinutes: 1, unitLabel: 'per pack', isPopular: true },
        ],
      },
    ],
  },
  'tea-coffee-snacks': {
    id: 'tea-coffee-snacks',
    name: 'Tea Stall & Refreshments',
    description: 'Hot beverages, samosas, vada, bun maska and quick bites',
    emoji: '☕',
    categories: [
      {
        categoryName: 'Hot Beverages',
        products: [
          { name: 'Masala Chai', priceMinor: 1500, prepMinutes: 3, unitLabel: '1 cup', isPopular: true },
          { name: 'Filter Coffee', priceMinor: 2000, prepMinutes: 4, unitLabel: '1 cup', isPopular: true },
          { name: 'Green Tea', priceMinor: 2500, prepMinutes: 3, unitLabel: '1 cup' },
          { name: 'Hot Chocolate', priceMinor: 3500, prepMinutes: 5, unitLabel: '1 cup' },
        ],
      },
      {
        categoryName: 'Snacks & Quick Bites',
        products: [
          { name: 'Hot Samosa (2 pcs)', priceMinor: 3000, prepMinutes: 3, unitLabel: '1 plate', isPopular: true },
          { name: 'Crispy Medu Vada (2 pcs)', priceMinor: 3500, prepMinutes: 4, unitLabel: '1 plate' },
          { name: 'Bun Maska', priceMinor: 3500, prepMinutes: 2, unitLabel: '1 bun', isPopular: true },
          { name: 'Bread Omelette (2 Eggs)', priceMinor: 5000, prepMinutes: 5, unitLabel: '1 plate', isPopular: true },
        ],
      },
    ],
  },
  'fresh-juices-fruits': {
    id: 'fresh-juices-fruits',
    name: 'Fresh Juices & Fruit Counter',
    description: 'Freshly squeezed juices, smoothies, and cut fruit bowls',
    emoji: '🍊',
    categories: [
      {
        categoryName: 'Fresh Juices',
        products: [
          { name: 'Fresh Sweet Lime (Mosambi) Juice', priceMinor: 6000, prepMinutes: 4, unitLabel: '300 ml glass', isPopular: true },
          { name: 'Watermelon Juice', priceMinor: 5000, prepMinutes: 3, unitLabel: '300 ml glass', isPopular: true },
          { name: 'Pomegranate Juice', priceMinor: 9000, prepMinutes: 5, unitLabel: '300 ml glass' },
        ],
      },
      {
        categoryName: 'Smoothies & Shakes',
        products: [
          { name: 'Mango Milkshake', priceMinor: 8000, prepMinutes: 5, unitLabel: '350 ml glass', isPopular: true },
          { name: 'Avocado Smoothie', priceMinor: 11000, prepMinutes: 6, unitLabel: '350 ml glass' },
          { name: 'Mixed Fruit Bowl', priceMinor: 9000, prepMinutes: 4, unitLabel: 'per bowl', isPopular: true },
        ],
      },
    ],
  },
  'bakery-sweets': {
    id: 'bakery-sweets',
    name: 'Bakery & Confectionery',
    description: 'Fresh breads, cookies, buns, and quick bakery items',
    emoji: '🥐',
    categories: [
      {
        categoryName: 'Fresh Breads & Buns',
        products: [
          { name: 'Whole Wheat Sandwich Bread', priceMinor: 4500, prepMinutes: 1, unitLabel: '1 loaf', isPopular: true },
          { name: 'Pav / Dinner Rolls (6 pcs)', priceMinor: 3000, prepMinutes: 1, unitLabel: '1 pkt', isPopular: true },
          { name: 'Cream Bun', priceMinor: 2500, prepMinutes: 1, unitLabel: '1 pc' },
        ],
      },
      {
        categoryName: 'Cookies & Pastries',
        products: [
          { name: 'Butter Cookies (250 g)', priceMinor: 9000, prepMinutes: 1, unitLabel: '1 box' },
          { name: 'Chocolate Truffle Cake Slice', priceMinor: 8500, prepMinutes: 2, unitLabel: '1 slice', isPopular: true },
          { name: 'Crispy Milk Rusk (200 g)', priceMinor: 4000, prepMinutes: 1, unitLabel: '1 pkt' },
        ],
      },
    ],
  },
};
